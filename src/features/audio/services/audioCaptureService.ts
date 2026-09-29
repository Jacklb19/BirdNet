import { AUDIO_WORKLET_PROCESSOR_CODE, type WorkletOutboundMessage } from '../worklet/audio-window-processor';
import { MelSpectrogramPipeline, type MelSpectrogramResponse } from '../worker/mel-spectrogram.worker';

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
  private melPipeline: MelSpectrogramPipeline | null = null;

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

      this.mediaStream = stream;

      const audioCtx = new AudioContext();
      this.audioContext = audioCtx;

      // Iniciar el pipeline de cómputo del mel-espectrograma
      this.melPipeline = new MelSpectrogramPipeline();

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

      const workletNode = new AudioWorkletNode(audioCtx, 'audio-window-processor');
      this.workletNode = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<WorkletOutboundMessage>): void => {
        const msg = event.data;
        switch (msg.type) {
          case 'LEVEL_UPDATE':
            this.callbacks.onLevelUpdate?.(msg.rms, msg.peak);
            break;
          case 'WINDOW_READY': {
            this.callbacks.onWindowReady?.(msg.buffer, msg.windowIndex, msg.timestamp);

            // Procesar mel-espectrograma en worker pipeline
            if (this.melPipeline) {
              const melResponse = this.melPipeline.processWindow(
                msg.buffer,
                msg.windowIndex,
                msg.timestamp,
              );
              this.callbacks.onMelSpectrogramReady?.(melResponse);
            }
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

    this.melPipeline = null;
  }
}
