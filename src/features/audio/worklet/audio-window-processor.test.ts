import { describe, it, expect } from 'vitest';
import {
  AudioWindowAccumulator,
  AUDIO_WORKLET_PROCESSOR_CODE,
} from './audio-window-processor';

describe('AudioWindowAccumulator', () => {
  it('no emite ventana hasta acumular el tamaño completo de ventana (3 s)', () => {
    const accumulator = new AudioWindowAccumulator(1000, 1000, 100, 50);
    const chunk = new Float32Array(30).fill(0.1);

    // 30 muestras
    expect(accumulator.processChunk(chunk)).toBeNull();
    // 60 muestras
    expect(accumulator.processChunk(chunk)).toBeNull();
    // 90 muestras
    expect(accumulator.processChunk(chunk)).toBeNull();

    // 120 muestras -> supera 100 -> emite primera ventana
    const result = accumulator.processChunk(chunk);
    expect(result).not.toBeNull();
    expect(result?.index).toBe(0);
    expect(result?.window.length).toBe(100);
  });

  it('emite ventanas subsecuentes cada hopSamples (1.5 s de avance)', () => {
    const accumulator = new AudioWindowAccumulator(1000, 1000, 100, 50);
    const chunk = new Float32Array(50).fill(0.2);

    // 50 muestras
    expect(accumulator.processChunk(chunk)).toBeNull();
    // 100 muestras -> emite ventana 0
    const win0 = accumulator.processChunk(chunk);
    expect(win0?.index).toBe(0);

    // Otras 50 muestras -> emite ventana 1
    const win1 = accumulator.processChunk(chunk);
    expect(win1).not.toBeNull();
    expect(win1?.index).toBe(1);
    expect(win1?.window.length).toBe(100);
  });

  it('reporta métricas de nivel RMS y pico periódicamente', () => {
    // 1000 Hz, nivel reportado cada 100 ms (100 muestras)
    const accumulator = new AudioWindowAccumulator(1000, 1000, 200, 100);
    const chunk = new Float32Array(100).fill(0.5);

    accumulator.processChunk(chunk);
    const metrics = accumulator.getLevelMetrics();

    expect(metrics).not.toBeNull();
    expect(metrics?.peak).toBeCloseTo(0.5, 4);
    expect(metrics?.rms).toBeCloseTo(0.5, 4);
  });

  it('AUDIO_WORKLET_PROCESSOR_CODE contiene el registro del procesador', () => {
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('registerProcessor');
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('audio-window-processor');
    expect(AUDIO_WORKLET_PROCESSOR_CODE).toContain('WINDOW_READY');
  });
});
