/**
 * Owns the lifecycle of the ONNX inference worker (RF-05): loads the model described by the manifest
 * (ADR-05), sends audio windows with back-pressure and reports detections through callbacks.
 */

import { config } from '../../config/env';
import {
  INFERENCE_ERROR_REASONS,
  INFERENCE_WORKER_MESSAGES,
  type ModelManifest,
  type ModelStatus,
  type InferenceWorkerOutbound,
  type Detection,
  type DisposeRequest,
  type InferRequest,
  type AlternateModel,
  type InferenceWorkerMessage,
} from './inference.types';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from './inference.constants';
import { planLoad, type DetectionChoices } from './loadPlan';
import { STATIC_MANIFEST_URL, validateManifest } from './modelManifest';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { LatestWindowQueue } from '../audio/services/latestWindowQueue';
import { offlineOperation } from '../offline/offlineClient';
import { OFFLINE_OPERATIONS } from '../offline/offline.constants';
import { getSettings } from '../offline/queueStore';
import type { PersistenceContext } from '../offline/types';

export interface InferenceCallbacks {
  onStatusChange?: (status: ModelStatus) => void;
  onModelLoaded?: (numClasses: number) => void;
  onInferenceResult?: (
    detections: readonly Detection[], windowIndex: number, timestamp: number, latencyMs: number, endToEndLatencyMs: number,
    regionSpecies: number | null,
  ) => void;
  onWindowDropped?: () => void;
  onError?: (error: string) => void;
  onStorageError?: () => void;
}

/** The person's choices of model and decision rule; the defaults where there is no storage to read them from. */
async function storedChoices(): Promise<DetectionChoices> {
  if (typeof indexedDB === 'undefined') return {};
  try { return await getSettings(); } catch { return {}; }
}

/** Asks the worker to release its session; it acknowledges with DISPOSED, and only then is it terminated. */
const DISPOSE_REQUEST: DisposeRequest = Object.freeze({ type: INFERENCE_WORKER_MESSAGES.dispose });

export class InferenceService {
  private worker: Worker | null = null;
  private status: ModelStatus = 'idle';
  private callbacks: InferenceCallbacks = {};
  private manifest: ModelManifest | null = null;
  private modelVersion: string | null = null;
  private expectedClasses: number | null = null;
  private generation = 0;
  private activeWindowIndex: number | null = null;
  private readonly queue = new LatestWindowQueue<InferRequest>(
    (request) => {
      this.activeWindowIndex = request.windowIndex;
      this.worker?.postMessage(request, [request.audioBuffer.buffer]);
    },
    () => { this.callbacks.onWindowDropped?.(); },
  );

  constructor(callbacks: InferenceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: InferenceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getStatus(): ModelStatus {
    return this.status;
  }

  public getManifest(): ModelManifest | null {
    return this.manifest;
  }

  /** Identifier of the model, or pair of models, loaded for this session; stored with what it detects. */
  public getModelVersion(): string | null {
    return this.modelVersion;
  }

  private setStatus(newStatus: ModelStatus): void {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }

  /**
   * Reads and validates the model manifest, then starts the worker, which downloads the model itself.
   * Once a service worker controls the page, the verified cached model is used instead of the network.
   *
   * @param manifestUrl Manifest location; model and label paths of a downloaded manifest resolve against it.
   */
  public async loadModel(manifestUrl: string = STATIC_MANIFEST_URL): Promise<void> {
    if (this.status === 'loading' || this.status === 'ready') {
      return;
    }

    this.setStatus('loading');
    const generation = ++this.generation;
    this.worker?.postMessage(DISPOSE_REQUEST);
    this.worker = null;
    this.activeWindowIndex = null;
    this.queue.clear();

    try {
      const origin = globalThis.location.origin;
      let candidate: unknown;
      // Base that the manifest's resource paths resolve against.
      let resourceBase = manifestUrl;
      const serviceWorkerSupported = 'serviceWorker' in navigator;
      const installed = (config.offlineEnabled && serviceWorkerSupported) || (serviceWorkerSupported && Boolean(navigator.serviceWorker.controller));
      if (installed) {
        const cached = await offlineOperation(OFFLINE_OPERATIONS.modelStatus);
        if (!cached) throw new Error('Download and verify the model before listening.');
        candidate = cached;
        // The service worker serves the verified copy under same-origin paths, wherever the manifest lives.
        resourceBase = origin;
      } else {
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error(`Error downloading manifest: ${String(response.status)}`);
        candidate = await response.json();
      }
      const manifest = validateManifest(candidate);
      // The second model counts only when it is on the device: verified by the service worker, or packaged in development.
      const alternate: AlternateModel | null = installed
        ? await offlineOperation(OFFLINE_OPERATIONS.alternateStatus).catch(() => null)
        : manifest.alternate ?? null;
      const plan = planLoad(manifest, alternate, await storedChoices(), resourceBase, origin);
      if (generation !== this.generation) return;
      this.manifest = manifest;
      this.modelVersion = plan.modelVersion;
      this.expectedClasses = plan.expectedClasses;

      this.worker = new Worker(
        new URL('./inference.worker.ts', import.meta.url),
        { type: 'module' },
      );

      const currentWorker = this.worker;
      this.worker.onmessage = (event: MessageEvent<InferenceWorkerMessage>) => {
        if (event.data.type === INFERENCE_WORKER_MESSAGES.disposed) { currentWorker.terminate(); return; }
        if (generation !== this.generation) return;
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (event: ErrorEvent) => {
        if (generation !== this.generation) return;
        this.queue.clear();
        this.setStatus('error');
        this.callbacks.onError?.(`Inference worker failed: ${event.message}`);
      };

      this.worker.postMessage(plan.request);
    } catch (err) {
      if (generation !== this.generation) return;
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      this.callbacks.onError?.(message);
    }
  }

  /**
   * Sends one audio window to the worker, transferring its buffer instead of copying it. While a window
   * is being classified only the latest pending one is kept (back-pressure).
   *
   * @param persistence When given, the classified window is stored before its result is reported.
   */
  public infer(
    audioBuffer: Float32Array,
    windowIndex: number,
    timestamp: number,
    topK: number = TOP_K,
    minConfidence: number = MIN_CANDIDATE_CONFIDENCE,
    persistence?: PersistenceContext,
  ): void {
    if (!this.worker || this.status !== 'ready') {
      return;
    }

    if (!this.manifest || audioBuffer.length !== AUDIO_CONSTANTS.WINDOW_SAMPLES || !Number.isFinite(timestamp)) {
      this.callbacks.onError?.('Invalid audio window.');
      return;
    }
    this.queue.enqueue({
        type: INFERENCE_WORKER_MESSAGES.infer,
        audioBuffer,
        windowIndex,
        timestamp,
        topK,
        minConfidence,
        ...(persistence ? { persistence } : {}),
    });
  }

  /** Releases the worker and its ONNX session. */
  public dispose(): void {
    this.generation++;
    this.queue.clear();
    this.activeWindowIndex = null;
    if (this.worker) {
      this.worker.postMessage(DISPOSE_REQUEST);
      // The worker acknowledges disposal after its active persistence transaction completes.
      this.worker = null;
    }
    this.setStatus('idle');
    this.manifest = null;
    this.modelVersion = null;
    this.expectedClasses = null;
  }

  private handleWorkerMessage(msg: InferenceWorkerOutbound): void {
    switch (msg.type) {
      case INFERENCE_WORKER_MESSAGES.modelLoaded:
        if (!this.manifest || (this.expectedClasses !== null && msg.numClasses !== this.expectedClasses)) {
          this.setStatus('error');
          this.callbacks.onError?.('Model label count does not match the manifest.');
          return;
        }
        this.setStatus('ready');
        this.callbacks.onModelLoaded?.(msg.numClasses);
        break;
      case INFERENCE_WORKER_MESSAGES.modelError:
        this.queue.clear();
        this.setStatus('error');
        this.callbacks.onError?.(msg.error);
        break;
      case INFERENCE_WORKER_MESSAGES.inferenceResult:
        if (msg.windowIndex !== this.activeWindowIndex) return;
        this.callbacks.onInferenceResult?.(
          msg.detections,
          msg.windowIndex,
          msg.timestamp,
          msg.latencyMs,
          Math.max(0, performance.now() - msg.timestamp),
          msg.regionSpecies,
        );
        this.activeWindowIndex = null;
        this.queue.complete();
        break;
      case INFERENCE_WORKER_MESSAGES.inferenceError:
        if (msg.windowIndex !== this.activeWindowIndex) return;
        if (msg.reason === INFERENCE_ERROR_REASONS.storage && this.callbacks.onStorageError) {
          this.queue.clear();
          this.activeWindowIndex = null;
          this.callbacks.onStorageError();
          return;
        }
        this.callbacks.onError?.(msg.error);
        this.activeWindowIndex = null;
        this.queue.complete();
        break;
    }
  }
}
