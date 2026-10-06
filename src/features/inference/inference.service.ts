/**
 * Servicio de inferencia que gestiona el ciclo de vida del Worker ONNX (RF-05).
 *
 * Responsabilidades:
 * - Instanciar y destruir el Web Worker de inferencia.
 * - Cargar el modelo desde las URL del manifiesto (ADR-05).
 * - Enviar ventanas de audio y recibir detecciones.
 * - Exponer callbacks para que la UI o el servicio de captura reaccionen.
 */

import type {
  ModelManifest,
  ModelStatus,
  InferenceWorkerOutbound,
  Detection,
  InferRequest,
} from './inference.types';
import { LatestWindowQueue } from '../audio/services/latestWindowQueue';
import { offlineOperation } from '../offline/offlineClient';
import type { PersistenceContext } from '../offline/types';
import type { InferenceWorkerMessage } from './inference.types';

export interface InferenceCallbacks {
  onStatusChange?: (status: ModelStatus) => void;
  onModelLoaded?: (numClasses: number) => void;
  onInferenceResult?: (detections: readonly Detection[], windowIndex: number, timestamp: number, latencyMs: number, endToEndLatencyMs: number) => void;
  onWindowDropped?: () => void;
  onError?: (error: string) => void;
  onStorageError?: () => void;
}

export class InferenceService {
  private worker: Worker | null = null;
  private status: ModelStatus = 'idle';
  private callbacks: InferenceCallbacks = {};
  private manifest: ModelManifest | null = null;
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

  private setStatus(newStatus: ModelStatus): void {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }

  /**
   * Carga el manifiesto del modelo y lanza el Worker de inferencia.
   * El modelo se descarga asíncronamente en el Worker.
   *
   * @param manifestUrl URL del manifest.json (por defecto /models/manifest.json)
   */
  public async loadModel(manifestUrl: string = '/models/manifest.json'): Promise<void> {
    if (this.status === 'loading' || this.status === 'ready') {
      return;
    }

    this.setStatus('loading');
    const generation = ++this.generation;
    this.worker?.postMessage({ type: 'DISPOSE' });
    this.worker = null;
    this.activeWindowIndex = null;
    this.queue.clear();

    try {
      // Descargar manifiesto
      let manifest: ModelManifest;
      if (import.meta.env.PROD && 'serviceWorker' in navigator || 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const cached = await offlineOperation<ModelManifest | null>('MODEL_STATUS');
        if (!cached) throw new Error('Download and verify the model before listening.');
        manifest = cached;
      } else {
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error(`Error downloading manifest: ${String(response.status)}`);
        manifest = await response.json() as ModelManifest;
      }
      if (generation !== this.generation) return;
      this.manifest = manifest;
      if (this.manifest.sample_rate !== 48000 || this.manifest.window_samples !== 144000 ||
          this.manifest.num_classes <= 0 || typeof this.manifest.model_file !== 'string' ||
          typeof this.manifest.labels_file !== 'string') {
        throw new Error('Incompatible model manifest.');
      }

      // Construir URLs absolutas para el modelo y labels
      const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
      const modelUrl = /^(https?:\/\/|\/)/.test(this.manifest.model_file) ? this.manifest.model_file : baseUrl + this.manifest.model_file;
      const labelsUrl = /^(https?:\/\/|\/)/.test(this.manifest.labels_file) ? this.manifest.labels_file : baseUrl + this.manifest.labels_file;

      // Instanciar Worker
      this.worker = new Worker(
        new URL('./inference.worker.ts', import.meta.url),
        { type: 'module' },
      );

      const currentWorker = this.worker;
      this.worker.onmessage = (event: MessageEvent<InferenceWorkerMessage>) => {
        if (event.data.type === 'DISPOSED') { currentWorker.terminate(); return; }
        if (generation !== this.generation) return;
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (event: ErrorEvent) => {
        if (generation !== this.generation) return;
        this.queue.clear();
        this.setStatus('error');
        this.callbacks.onError?.(`Error en Worker de inferencia: ${event.message}`);
      };

      // Enviar orden de carga al Worker
      this.worker.postMessage({
        type: 'LOAD_MODEL',
        modelUrl,
        labelsUrl,
      });
    } catch (err) {
      if (generation !== this.generation) return;
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      this.callbacks.onError?.(message);
    }
  }

  /**
   * Envía una ventana de audio al Worker para inferencia.
   * Transfiere el buffer para evitar copia de memoria.
   */
  public infer(
    audioBuffer: Float32Array,
    windowIndex: number,
    timestamp: number,
    topK: number = 5,
    minConfidence: number = 0.1,
    persistence?: PersistenceContext,
  ): void {
    if (!this.worker || this.status !== 'ready') {
      return;
    }

    if (audioBuffer.length !== this.manifest?.window_samples || !Number.isFinite(timestamp)) {
      this.callbacks.onError?.('Invalid audio window.');
      return;
    }
    this.queue.enqueue({
        type: 'INFER',
        audioBuffer,
        windowIndex,
        timestamp,
        topK,
        minConfidence,
        ...(persistence ? { persistence } : {}),
    });
  }

  /**
   * Libera el Worker y la sesión ONNX.
   */
  public dispose(): void {
    this.generation++;
    this.queue.clear();
    this.activeWindowIndex = null;
    if (this.worker) {
      this.worker.postMessage({ type: 'DISPOSE' });
      // The worker acknowledges disposal after its active persistence transaction completes.
      this.worker = null;
    }
    this.setStatus('idle');
    this.manifest = null;
  }

  private handleWorkerMessage(msg: InferenceWorkerOutbound): void {
    switch (msg.type) {
      case 'MODEL_LOADED':
        if (msg.numClasses !== this.manifest?.num_classes) {
          this.setStatus('error');
          this.callbacks.onError?.('Model label count does not match the manifest.');
          return;
        }
        this.setStatus('ready');
        this.callbacks.onModelLoaded?.(msg.numClasses);
        break;
      case 'MODEL_ERROR':
        this.queue.clear();
        this.setStatus('error');
        this.callbacks.onError?.(msg.error);
        break;
      case 'INFERENCE_RESULT':
        if (msg.windowIndex !== this.activeWindowIndex) return;
        this.callbacks.onInferenceResult?.(
          msg.detections,
          msg.windowIndex,
          msg.timestamp,
          msg.latencyMs,
          Math.max(0, performance.now() - msg.timestamp),
        );
        this.activeWindowIndex = null;
        this.queue.complete();
        break;
      case 'INFERENCE_ERROR':
        if (msg.windowIndex !== this.activeWindowIndex) return;
        if (msg.reason === 'storage' && this.callbacks.onStorageError) {
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
