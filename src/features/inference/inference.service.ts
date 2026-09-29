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
} from './inference.types';

export interface InferenceCallbacks {
  onStatusChange?: (status: ModelStatus) => void;
  onModelLoaded?: (numClasses: number) => void;
  onInferenceResult?: (detections: readonly Detection[], windowIndex: number, timestamp: number, latencyMs: number) => void;
  onError?: (error: string) => void;
}

export class InferenceService {
  private worker: Worker | null = null;
  private status: ModelStatus = 'idle';
  private callbacks: InferenceCallbacks = {};
  private manifest: ModelManifest | null = null;

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

    try {
      // Descargar manifiesto
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`Error descargando manifiesto: ${String(response.status)}`);
      }
      this.manifest = (await response.json()) as ModelManifest;

      // Construir URLs absolutas para el modelo y labels
      const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
      const modelUrl = baseUrl + this.manifest.model_file;
      const labelsUrl = baseUrl + this.manifest.labels_file;

      // Instanciar Worker
      this.worker = new Worker(
        new URL('./inference.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = (event: MessageEvent<InferenceWorkerOutbound>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (event: ErrorEvent) => {
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
  ): void {
    if (!this.worker || this.status !== 'ready') {
      return;
    }

    this.worker.postMessage(
      {
        type: 'INFER',
        audioBuffer,
        windowIndex,
        timestamp,
        topK,
        minConfidence,
      },
      [audioBuffer.buffer],
    );
  }

  /**
   * Libera el Worker y la sesión ONNX.
   */
  public dispose(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'DISPOSE' });
      this.worker.terminate();
      this.worker = null;
    }
    this.setStatus('idle');
    this.manifest = null;
  }

  private handleWorkerMessage(msg: InferenceWorkerOutbound): void {
    switch (msg.type) {
      case 'MODEL_LOADED':
        this.setStatus('ready');
        this.callbacks.onModelLoaded?.(msg.numClasses);
        break;
      case 'MODEL_ERROR':
        this.setStatus('error');
        this.callbacks.onError?.(msg.error);
        break;
      case 'INFERENCE_RESULT':
        this.callbacks.onInferenceResult?.(
          msg.detections,
          msg.windowIndex,
          msg.timestamp,
          msg.latencyMs,
        );
        break;
      case 'INFERENCE_ERROR':
        this.callbacks.onError?.(msg.error);
        break;
    }
  }
}
