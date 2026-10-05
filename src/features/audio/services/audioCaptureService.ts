import { AUDIO_WORKLET_PROCESSOR_CODE, type WorkletOutboundMessage } from '../worklet/audio-window-processor';
import type { MelSpectrogramResponse, MelWorkerOutboundMessage } from '../worker/mel-spectrogram.worker';
import { LatestWindowQueue } from './latestWindowQueue';

export type AudioCaptureState =
  | 'idle'
  | 'solicitando_permiso'
  | 'escuchando'
  | 'pausado'
  | 'error';

export interface AudioCaptureCallbacks {
  onStateChange?: (state: AudioCaptureState) => void;
  onLevelUpdate?: (rms: number, peak: number) => void;
  onWindowReady?: (buffer: Float32Array, windowIndex: number, timestamp: number) => void;
  onWindowsDropped?: (count: number) => void;
  onMelSpectrogramReady?: (response: MelSpectrogramResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Servicio encargado de gestionar el ciclo de vida del micrófono,
 * AudioContext, AudioWorkletNode y la canalización al worker de mel-espectrograma.
 */
export class AudioCaptureService {
  private state: AudioCaptureState = 'idle';
  private callbacks: AudioCaptureCallbacks = {};

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private melWorker: Worker | null = null;
  private readonly melQueue = new LatestWindowQueue<WorkletOutboundMessage & { type: 'WINDOW_READY' }>(
    (message) => {
      this.melWorker?.postMessage({ ...message, type: 'COMPUTE_MEL' }, [message.buffer.buffer]);
    },
  );
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

  /**
   * Inicia la captura continua de audio solicitando acceso al micrófono.
   */
  public async start(): Promise<void> {
    if (this.state === 'escuchando' || this.state === 'solicitando_permiso') {
      return;
    }

    try {
      const generation = ++this.generation;
      this.setState('solicitando_permiso');

      if (typeof navigator === 'undefined' || !('mediaDevices' in navigator)) {
        throw new Error('La API MediaDevices no está disponible en este entorno.');
      }

      // Desactivamos supresión de ruido y cancelación de eco para no mutilar trinos agudos de aves
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => { track.stop(); });
        return;
      }

      this.mediaStream = stream;

      const audioCtx = new AudioContext({ sampleRate: 48000 });
      this.audioContext = audioCtx;

      this.melWorker = new Worker(new URL('../worker/mel-spectrogram.worker.ts', import.meta.url), { type: 'module' });
      this.melWorker.onmessage = (event: MessageEvent<MelWorkerOutboundMessage>): void => {
        if (generation !== this.generation) return;
        if (event.data.type === 'MEL_ERROR') {
          this.callbacks.onError?.(new Error(event.data.error));
        } else {
          this.callbacks.onMelSpectrogramReady?.(event.data);
        }
        this.melQueue.complete();
      };
      this.melWorker.onerror = (): void => {
        if (generation !== this.generation) return;
        this.callbacks.onError?.(new Error('Spectrogram worker failed.'));
        void this.stop();
      };

      // Cargar el procesador en AudioWorklet
      const blob = new Blob([AUDIO_WORKLET_PROCESSOR_CODE], {
        type: 'application/javascript',
      });
      const workletUrl = URL.createObjectURL(blob);

      try {
        await audioCtx.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }
      if (generation !== this.generation) return;

      const workletNode = new AudioWorkletNode(audioCtx, 'audio-window-processor');
      this.workletNode = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<WorkletOutboundMessage>): void => {
        if (generation !== this.generation) return;
        const msg = event.data;
        switch (msg.type) {
          case 'LEVEL_UPDATE':
            this.callbacks.onLevelUpdate?.(msg.rms, msg.peak);
            break;
          case 'WINDOW_READY': {
            // Translate the audio clock to the main performance clock, including delivery delay.
            const capturedAtMs = performance.now() - Math.max(0, audioCtx.currentTime - msg.timestamp) * 1000;
            // Each consumer owns its buffer, including windows waiting behind a busy worker.
            this.melQueue.enqueue({ ...msg, buffer: msg.buffer.slice() });
            this.callbacks.onWindowsDropped?.(msg.droppedWindows ?? 0);
            this.callbacks.onWindowReady?.(msg.buffer, msg.windowIndex, capturedAtMs);
            workletNode.port.postMessage({ type: 'WINDOW_ACK' });
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

      this.setState('escuchando');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState('error');
      this.callbacks.onError?.(error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Detiene y libera todos los recursos de audio.
   */
  public async stop(): Promise<void> {
    this.generation++;
    await this.cleanup();
    this.setState('idle');
  }

  private async cleanup(): Promise<void> {
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
      this.workletNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.melWorker?.terminate();
    this.melWorker = null;
    this.melQueue.clear();
  }
}
