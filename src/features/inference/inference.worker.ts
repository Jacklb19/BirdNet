/**
 * Worker de inferencia ONNX para BirdNET v2.4 (RF-05, ADR-01).
 *
 * Ejecuta el modelo clasificador en un Web Worker dedicado para no bloquear
 * el hilo principal. El modelo recibe audio crudo normalizado [1, 144000]
 * a 48 kHz y devuelve logits [1, 6522] que se convierten a probabilidades
 * mediante sigmoide.
 *
 * Ciclo de vida:
 *   1. LOAD_MODEL → descarga ONNX + labels → MODEL_LOADED / MODEL_ERROR
 *   2. INFER → inferencia + top-K + sigmoide → INFERENCE_RESULT / INFERENCE_ERROR
 *   3. DISPOSE → libera sesión ONNX
 */

import * as ort from 'onnxruntime-web';

import type {
  Detection,
  InferenceWorkerInbound,
  InferenceWorkerOutbound,
  LoadModelRequest,
  InferRequest,
} from './inference.types';

// ─── Estado del Worker ───────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;
let labels: string[] = [];

// ─── Utilidades ──────────────────────────────────────────────────────────

/** Sigmoide escalar estable numéricamente */
function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

/**
 * Parsea una etiqueta del formato "Genus species_Common Name"
 * en nombre científico y nombre común.
 */
function parseLabel(label: string): { scientificName: string; commonName: string } {
  const separatorIdx = label.indexOf('_');
  if (separatorIdx === -1) {
    return { scientificName: label, commonName: label };
  }
  return {
    scientificName: label.substring(0, separatorIdx),
    commonName: label.substring(separatorIdx + 1),
  };
}

/**
 * Extrae las top-K detecciones de un vector de logits aplicando sigmoide
 * y filtrando por umbral de confianza mínimo.
 */
function extractTopDetections(
  logits: Float32Array,
  topK: number,
  minConfidence: number,
): Detection[] {
  // Calcular probabilidades y encontrar los top-K índices
  const indices: number[] = [];
  const confidences: number[] = [];

  for (let i = 0; i < logits.length; i++) {
    const prob = sigmoid(logits[i] ?? 0);
    if (prob >= minConfidence) {
      indices.push(i);
      confidences.push(prob);
    }
  }

  // Ordenar por confianza descendente
  const sortedPairs = indices
    .map((idx, i) => ({ idx, conf: confidences[i] ?? 0 }))
    .sort((a, b) => b.conf - a.conf)
    .slice(0, topK);

  return sortedPairs.map(({ idx, conf }) => {
    const label = labels[idx] ?? `unknown_${String(idx)}`;
    const { scientificName, commonName } = parseLabel(label);
    return {
      classIndex: idx,
      label,
      scientificName,
      commonName,
      confidence: conf,
    };
  });
}

// ─── Handlers ────────────────────────────────────────────────────────────

async function handleLoadModel(msg: LoadModelRequest): Promise<void> {
  try {
    // Descargar labels.txt
    const labelsResponse = await fetch(msg.labelsUrl);
    if (!labelsResponse.ok) {
      throw new Error(`Error descargando labels: ${String(labelsResponse.status)} ${labelsResponse.statusText}`);
    }
    const labelsText = await labelsResponse.text();
    labels = labelsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (labels.length === 0) {
      throw new Error('labels.txt está vacío o no se pudo parsear.');
    }

    // Configurar ONNX Runtime para WASM
    ort.env.wasm.numThreads = 1;

    // Crear sesión ONNX
    session = await ort.InferenceSession.create(msg.modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    // Verificar forma de entrada/salida
    const inputNames = session.inputNames;
    const outputNames = session.outputNames;
    if (inputNames.length === 0 || outputNames.length === 0) {
      throw new Error('El modelo ONNX no tiene entradas o salidas válidas.');
    }

    // Obtener tamaño del modelo para el reporte
    const modelResponse = await fetch(msg.modelUrl, { method: 'HEAD' });
    const modelSizeBytes = parseInt(modelResponse.headers.get('content-length') ?? '0', 10);

    postOutbound({
      type: 'MODEL_LOADED',
      numClasses: labels.length,
      modelSizeBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postOutbound({ type: 'MODEL_ERROR', error: message });
  }
}

async function handleInfer(msg: InferRequest): Promise<void> {
  if (!session) {
    postOutbound({
      type: 'INFERENCE_ERROR',
      error: 'Modelo no cargado. Enviar LOAD_MODEL primero.',
      windowIndex: msg.windowIndex,
      timestamp: msg.timestamp,
    });
    return;
  }

  try {
    const topK = msg.topK ?? 5;
    const minConfidence = msg.minConfidence ?? 0.1;

    // Preparar tensor de entrada [1, 144000]
    const inputTensor = new ort.Tensor('float32', msg.audioBuffer, [1, msg.audioBuffer.length]);
    const inputName = session.inputNames[0];
    if (!inputName) {
      throw new Error('No se encontró el nombre de la entrada del modelo.');
    }

    const t0 = performance.now();
    const results = await session.run({ [inputName]: inputTensor });
    const latencyMs = performance.now() - t0;

    const outputName = session.outputNames[0];
    if (!outputName) {
      throw new Error('No se encontró el nombre de la salida del modelo.');
    }
    const outputTensor = results[outputName];
    if (!outputTensor) {
      throw new Error('La salida del modelo es nula.');
    }
    const logits = outputTensor.data as Float32Array;

    const detections = extractTopDetections(logits, topK, minConfidence);

    postOutbound({
      type: 'INFERENCE_RESULT',
      detections,
      windowIndex: msg.windowIndex,
      timestamp: msg.timestamp,
      latencyMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postOutbound({
      type: 'INFERENCE_ERROR',
      error: message,
      windowIndex: msg.windowIndex,
      timestamp: msg.timestamp,
    });
  }
}

async function handleDispose(): Promise<void> {
  if (session) {
    await session.release();
    session = null;
  }
  labels = [];
}

// ─── Punto de entrada del Worker ─────────────────────────────────────────

function postOutbound(msg: InferenceWorkerOutbound): void {
  (self as unknown as { postMessage: (msg: unknown) => void }).postMessage(msg);
}

self.onmessage = (event: MessageEvent<InferenceWorkerInbound>): void => {
  const msg = event.data;

  switch (msg.type) {
    case 'LOAD_MODEL':
      void handleLoadModel(msg);
      break;
    case 'INFER':
      void handleInfer(msg);
      break;
    case 'DISPOSE':
      void handleDispose();
      break;
  }
};
