import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import {
  AUDIO_WINDOW_PROCESSOR_OPTIONS,
  WORKLET_MESSAGE_TYPES,
  type AudioWindowMessage,
  type WorkletInboundMessage,
  type WorkletOutboundMessage,
} from '../worklet/audio-window-processor';
// Same-origin URL: the CSP script-src, which governs worklets, does not allow blob: modules.
import workletUrl from '../worklet/audio-window-processor.worklet.js?url';
import {
  MEL_WORKER_MESSAGES,
  type ComputeMelRequest,
  type MelSpectrogramResponse,
  type MelWorkerOutboundMessage,
} from '../worker/mel-spectrogram.protocol';
import { LatestWindowQueue } from './latestWindowQueue';

export type AudioCaptureState =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'paused'
  | 'error';

export interface AudioCaptureCallbacks {
  onStateChange?: (state: AudioCaptureState) => void;
  onLevelUpdate?: (rms: number, peak: number) => void;
  onWindowReady?: (buffer: Float32Array, windowIndex: number, timestamp: number) => void;
  onWindowsDropped?: (count: number) => void;
  onMelSpectrogramReady?: (response: MelSpectrogramResponse) => void;
  onError?: (error: Error) => void;
}

/** Internal failure messages by code; the UI maps codes, never these English texts, to translated copy. */
const AUDIO_CAPTURE_ERROR_MESSAGES = Object.freeze({
  media_devices_unavailable: 'The MediaDevices API is not available in this environment.',
  spectrogram_worker_failed: 'Spectrogram worker failed.',
  window_processor_failed: 'Audio window processor failed.',
} as const);

export type AudioCaptureErrorCode = keyof typeof AUDIO_CAPTURE_ERROR_MESSAGES;

/** A capture failure raised by this service itself (not by the browser), identified by `code`. */
export class AudioCaptureError extends Error {
  public readonly code: AudioCaptureErrorCode;

  constructor(code: AudioCaptureErrorCode) {
    super(AUDIO_CAPTURE_ERROR_MESSAGES[code]);
    this.name = 'AudioCaptureError';
    this.code = code;
  }
}

const MS_PER_SECOND = 1000;

/**
 * Owns the microphone, the AudioContext, the AudioWorkletNode and the spectrogram worker of one
 * listening session, and releases all of them on stop or failure.
 */
export class AudioCaptureService {
  private state: AudioCaptureState = 'idle';
  private callbacks: AudioCaptureCallbacks = {};

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private melWorker: Worker | null = null;
  private readonly melQueue = new LatestWindowQueue<AudioWindowMessage>((message) => {
    const request: ComputeMelRequest = {
      type: MEL_WORKER_MESSAGES.computeMel, buffer: message.buffer, windowIndex: message.windowIndex, timestamp: message.timestamp,
    };
    this.melWorker?.postMessage(request, [message.buffer.buffer]);
  });
  private generation = 0;

  constructor(callbacks: AudioCaptureCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: AudioCaptureCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getState(): AudioCaptureState {
    return this.state;
  }

  private setState(newState: AudioCaptureState): void {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  /** Requests the microphone and starts continuous capture; rejects (and reports) on failure. */
  public async start(): Promise<void> {
    if (this.state === 'listening' || this.state === 'requesting_permission') {
      return;
    }

    const generation = ++this.generation;
    try {
      this.setState('requesting_permission');

      if (typeof navigator === 'undefined' || !('mediaDevices' in navigator)) {
        throw new AudioCaptureError('media_devices_unavailable');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTANTS.CAPTURE_CONSTRAINTS });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => { track.stop(); });
        return;
      }

      this.mediaStream = stream;

      // Request the model rate; a device that cannot provide it is resampled inside the worklet.
      const audioCtx = new AudioContext({ sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE });
      this.audioContext = audioCtx;

      this.melWorker = new Worker(new URL('../worker/mel-spectrogram.worker.ts', import.meta.url), { type: 'module' });
      this.melWorker.onmessage = (event: MessageEvent<MelWorkerOutboundMessage>): void => {
        if (generation !== this.generation) return;
        if (event.data.type === MEL_WORKER_MESSAGES.error) {
          this.callbacks.onError?.(new Error(event.data.error));
        } else {
          this.callbacks.onMelSpectrogramReady?.(event.data);
        }
        this.melQueue.complete();
      };
      this.melWorker.onerror = (): void => {
        if (generation !== this.generation) return;
        this.callbacks.onError?.(new AudioCaptureError('spectrogram_worker_failed'));
        void this.stop();
      };

      await audioCtx.audioWorklet.addModule(workletUrl);
      if (generation !== this.generation) return;

      const workletNode = new AudioWorkletNode(audioCtx, AUDIO_CONSTANTS.WORKLET_PROCESSOR_NAME, {
        processorOptions: AUDIO_WINDOW_PROCESSOR_OPTIONS,
      });
      this.workletNode = workletNode;
      // Fired when the processor throws, including when it rejects its options.
      workletNode.onprocessorerror = (): void => {
        if (generation !== this.generation) return;
        this.callbacks.onError?.(new AudioCaptureError('window_processor_failed'));
        void this.stop();
      };

      workletNode.port.onmessage = (event: MessageEvent<WorkletOutboundMessage>): void => {
        if (generation !== this.generation) return;
        const msg = event.data;
        switch (msg.type) {
          case WORKLET_MESSAGE_TYPES.levelUpdate:
            this.callbacks.onLevelUpdate?.(msg.rms, msg.peak);
            break;
          case WORKLET_MESSAGE_TYPES.windowReady: {
            // Translate the audio clock to the main performance clock, including delivery delay.
            const capturedAtMs = performance.now() - Math.max(0, audioCtx.currentTime - msg.timestamp) * MS_PER_SECOND;
            // Each consumer owns its buffer, including windows waiting behind a busy worker.
            this.melQueue.enqueue({ ...msg, buffer: msg.buffer.slice() });
            this.callbacks.onWindowsDropped?.(msg.droppedWindows ?? 0);
            this.callbacks.onWindowReady?.(msg.buffer, msg.windowIndex, capturedAtMs);
            const ack: WorkletInboundMessage = { type: WORKLET_MESSAGE_TYPES.windowAck };
            workletNode.port.postMessage(ack);
            break;
          }
        }
      };

      const source = audioCtx.createMediaStreamSource(stream);
      this.sourceNode = source;
      source.connect(workletNode);

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (generation !== this.generation) return;
      this.setState('listening');
    } catch (err) {
      if (generation !== this.generation) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState('error');
      this.callbacks.onError?.(error);
      await this.cleanup();
      throw error;
    }
  }

  /** Stops capture and releases every audio resource. */
  public async stop(): Promise<void> {
    this.generation++;
    await this.cleanup();
    this.setState('idle');
  }

  private async cleanup(): Promise<void> {
    this.melWorker?.terminate();
    this.melWorker = null;
    this.melQueue.clear();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.mediaStream = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
      this.workletNode.onprocessorerror = null;
      this.workletNode = null;
    }

    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }
}
