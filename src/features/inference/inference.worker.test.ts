/**
 * Tests unitarios para el Worker de inferencia ONNX.
 * Prueban las funciones puras extraídas: sigmoid, parseLabel, extractTopDetections.
 * La sesión ONNX real se prueba en el test de integración con audios de referencia.
 */
import { describe, it, expect } from 'vitest';

// Replicamos las funciones puras del Worker para probarlas sin contexto de Worker
function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const expX = Math.exp(x);
  return expX / (1 + expX);
}

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

interface Detection {
  classIndex: number;
  label: string;
  scientificName: string;
  commonName: string;
  confidence: number;
}

function extractTopDetections(
  logits: Float32Array,
  topK: number,
  minConfidence: number,
  testLabels: string[],
): Detection[] {
  const indices: number[] = [];
  const confidences: number[] = [];

  for (let i = 0; i < logits.length; i++) {
    const prob = sigmoid(logits[i] ?? 0);
    if (prob >= minConfidence) {
      indices.push(i);
      confidences.push(prob);
    }
  }

  const sortedPairs = indices
    .map((idx, i) => ({ idx, conf: confidences[i] ?? 0 }))
    .sort((a, b) => b.conf - a.conf)
    .slice(0, topK);

  return sortedPairs.map(({ idx, conf }) => {
    const label = testLabels[idx] ?? `unknown_${String(idx)}`;
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

describe('sigmoid', () => {
  it('devuelve 0.5 para entrada 0', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
  });

  it('se aproxima a 1 para entradas positivas grandes', () => {
    expect(sigmoid(10)).toBeGreaterThan(0.9999);
  });

  it('se aproxima a 0 para entradas negativas grandes', () => {
    expect(sigmoid(-10)).toBeLessThan(0.0001);
  });

  it('es numéricamente estable para valores extremos', () => {
    // No debe devolver NaN ni Infinity
    expect(Number.isFinite(sigmoid(1000))).toBe(true);
    expect(Number.isFinite(sigmoid(-1000))).toBe(true);
    expect(sigmoid(1000)).toBeCloseTo(1.0, 10);
    expect(sigmoid(-1000)).toBeCloseTo(0.0, 10);
  });
});

describe('parseLabel', () => {
  it('separa correctamente el nombre científico y común', () => {
    const result = parseLabel('Turdus fuscater_Great Thrush');
    expect(result.scientificName).toBe('Turdus fuscater');
    expect(result.commonName).toBe('Great Thrush');
  });

  it('maneja etiquetas sin separador de guion bajo', () => {
    const result = parseLabel('Unknown species');
    expect(result.scientificName).toBe('Unknown species');
    expect(result.commonName).toBe('Unknown species');
  });

  it('maneja etiquetas con múltiples guiones bajos', () => {
    const result = parseLabel('Genus species_Common_Name_With_Underscores');
    expect(result.scientificName).toBe('Genus species');
    expect(result.commonName).toBe('Common_Name_With_Underscores');
  });
});

describe('extractTopDetections', () => {
  const testLabels = [
    'Turdus fuscater_Great Thrush',
    'Zonotrichia capensis_Rufous-collared Sparrow',
    'Troglodytes aedon_House Wren',
    'Tyrannus melancholicus_Tropical Kingbird',
    'Columba livia_Rock Pigeon',
  ];

  it('extrae el top-1 correcto de logits sintéticos', () => {
    // Logit alto en índice 1 (Zonotrichia capensis)
    const logits = new Float32Array([0.0, 5.0, -1.0, -2.0, -3.0]);
    const results = extractTopDetections(logits, 1, 0.1, testLabels);
    expect(results).toHaveLength(1);
    expect(results[0]?.scientificName).toBe('Zonotrichia capensis');
    expect(results[0]?.confidence).toBeGreaterThan(0.99);
  });

  it('respeta el umbral de confianza mínimo', () => {
    // Todos los logits negativos → probabilidades bajas
    const logits = new Float32Array([-5.0, -5.0, -5.0, -5.0, -5.0]);
    const results = extractTopDetections(logits, 5, 0.1, testLabels);
    expect(results).toHaveLength(0);
  });

  it('ordena por confianza descendente', () => {
    const logits = new Float32Array([2.0, 4.0, 1.0, 3.0, 0.5]);
    const results = extractTopDetections(logits, 5, 0.1, testLabels);
    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev && curr) {
        expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
      }
    }
  });

  it('limita resultados a topK', () => {
    const logits = new Float32Array([2.0, 4.0, 1.0, 3.0, 0.5]);
    const results = extractTopDetections(logits, 2, 0.1, testLabels);
    expect(results).toHaveLength(2);
    expect(results[0]?.scientificName).toBe('Zonotrichia capensis');
    expect(results[1]?.scientificName).toBe('Tyrannus melancholicus');
  });
});
