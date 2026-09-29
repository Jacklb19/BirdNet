/**
 * Pruebas de integración del modelo de inferencia BirdNET v2.4 (RF-05, RNF-01, RNF-09).
 *
 * Carga el modelo ONNX cuantizado real y verifica que clasifique correctamente
 * el top-1 de las grabaciones de prueba de aves colombianas (Xeno-Canto),
 * cumpliendo con los criterios de precisión, latencia (< 1,5 s) y formato de confianza.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as ort from 'onnxruntime-web';

interface AudioMetadata {
  id: string;
  species_scientific: string;
  species_common: string;
  filename: string;
  sample_rate: number;
  best_window_offset_sec: number;
}

function readWavSamples(filePath: string): Float32Array {
  const buf = fs.readFileSync(filePath);
  const dataIdx = buf.indexOf('data');
  if (dataIdx === -1) {
    throw new Error(`No se encontró el subchunk 'data' en ${filePath}`);
  }
  const start = dataIdx + 8;
  const numSamples = Math.floor((buf.length - start) / 2);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = buf.readInt16LE(start + i * 2) / 32768.0;
  }
  return samples;
}

function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

const MODEL_PATH = path.resolve(process.cwd(), 'public/models/birdnet_model.onnx');
const LABELS_PATH = path.resolve(process.cwd(), 'public/models/labels.txt');
const METADATA_PATH = path.resolve(process.cwd(), 'public/test-audio/metadata.json');

const hasModel = fs.existsSync(MODEL_PATH);

describe.runIf(hasModel)('Inferencia ONNX con modelo real (Integración)', () => {
  let session: ort.InferenceSession;
  let labels: string[];
  let testMetadata: AudioMetadata[];

  it('carga la sesión del modelo ONNX y el archivo de etiquetas', async () => {
    labels = fs
      .readFileSync(LABELS_PATH, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    testMetadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8')) as AudioMetadata[];

    expect(labels.length).toBe(6522);
    expect(testMetadata.length).toBeGreaterThanOrEqual(4);

    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['wasm'],
    });

    expect(session.inputNames).toContain('input');
    expect(session.outputNames).toContain('output');
  });

  it('clasifica correctamente las 4 grabaciones de prueba en top-1 con latencia < 1500 ms (RNF-01, RNF-09)', async () => {
    for (const item of testMetadata) {
      const audioPath = path.resolve(process.cwd(), 'public/test-audio', item.filename);
      expect(fs.existsSync(audioPath)).toBe(true);

      const allSamples = readWavSamples(audioPath);
      const offsetSamples = Math.floor(item.best_window_offset_sec * item.sample_rate);

      // Extraer ventana de 144.000 muestras (3,0 s a 48 kHz)
      const window = new Float32Array(144000);
      const available = Math.min(144000, allSamples.length - offsetSamples);
      window.set(allSamples.subarray(offsetSamples, offsetSamples + available));

      // Medir latencia (RNF-01: < 1500 ms)
      const t0 = performance.now();
      const inputTensor = new ort.Tensor('float32', window, [1, 144000]);
      const results = await session.run({ input: inputTensor });
      const latencyMs = performance.now() - t0;

      expect(latencyMs).toBeLessThan(1500);

      const outputTensor = results.output;
      expect(outputTensor).toBeDefined();
      if (!outputTensor) {
        throw new Error('outputTensor no está definido');
      }
      const logits = outputTensor.data as Float32Array;
      expect(logits.length).toBe(labels.length);

      // Encontrar top-1
      let maxIdx = 0;
      let maxScore = -Infinity;
      for (let i = 0; i < logits.length; i++) {
        const p = sigmoid(logits[i] ?? 0);
        if (p > maxScore) {
          maxScore = p;
          maxIdx = i;
        }
      }

      const predictedLabel = labels[maxIdx] ?? '';

      // Verificar que el nombre científico de la predicción coincide con la especie conocida
      expect(predictedLabel).toContain(item.species_scientific);

      // Verificar política de confianza (RNF-09: confianza calculada honestamente, sin presentar certeza absoluta 1.0)
      expect(maxScore).toBeGreaterThan(0.8); // Detección confirmada según tabla 7 (≥ 0,80)
      expect(maxScore).toBeLessThan(1.0); // RNF-09: ninguna es certeza absoluta
    }
  });
});
