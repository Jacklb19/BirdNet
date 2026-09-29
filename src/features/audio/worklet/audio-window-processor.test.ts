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

  it('una entrada a 44.1 kHz produce ventanas de exactamente 144.000 muestras a 48 kHz y conserva la frecuencia de un tono de 1 kHz (RF-03)', () => {
    // 44100 Hz de entrada -> 48000 Hz objetivo, ventana de 144.000 muestras (3 s), salto de 72.000 (1.5 s)
    const accumulator = new AudioWindowAccumulator(44100, 48000, 144000, 72000);
    const chunkSize = 128;
    const toneFreq = 1000; // 1 kHz
    const totalInputDurationSec = 3.5;
    const totalInputSamples = Math.floor(totalInputDurationSec * 44100);

    let emittedWindow: Float32Array | null = null;
    let windowIndex = -1;

    for (let offset = 0; offset < totalInputSamples; offset += chunkSize) {
      const len = Math.min(chunkSize, totalInputSamples - offset);
      const chunk = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = (offset + i) / 44100;
        chunk[i] = Math.sin(2 * Math.PI * toneFreq * t) * 0.8;
      }

      const res = accumulator.processChunk(chunk);
      if (res && emittedWindow === null) {
        emittedWindow = res.window;
        windowIndex = res.index;
      }
    }

    expect(emittedWindow).not.toBeNull();
    expect(windowIndex).toBe(0);
    // Verificación 1: Tamaño exacto de 144.000 muestras a 48 kHz
    expect(emittedWindow?.length).toBe(144000);

    // Verificación 2: El tono de 1 kHz conserva su frecuencia a 48 kHz
    // En una ventana de 144.000 muestras a 48 kHz, la resolución frecuencial es 48000 / 144000 = 1/3 Hz.
    // El bin exacto para 1000 Hz es 1000 / (1/3) = 3000.
    if (!emittedWindow) {
      throw new Error('No se emitió ninguna ventana');
    }
    const win = emittedWindow;
    function computeDftMagnitude(targetFreq: number): number {
      let real = 0;
      let imag = 0;
      const omega = (2 * Math.PI * targetFreq) / 48000;
      for (let n = 0; n < win.length; n++) {
        const val = win[n] ?? 0;
        real += val * Math.cos(omega * n);
        imag -= val * Math.sin(omega * n);
      }
      return Math.sqrt(real * real + imag * imag);
    }

    const mag1000 = computeDftMagnitude(1000);
    const mag950 = computeDftMagnitude(950);
    const mag1050 = computeDftMagnitude(1050);
    const mag500 = computeDftMagnitude(500);
    const mag2000 = computeDftMagnitude(2000);

    // La magnitud en 1000 Hz debe ser órdenes de magnitud superior a frecuencias alejadas
    expect(mag1000).toBeGreaterThan(mag950 * 50);
    expect(mag1000).toBeGreaterThan(mag1050 * 50);
    expect(mag1000).toBeGreaterThan(mag500 * 500);
    expect(mag1000).toBeGreaterThan(mag2000 * 500);

    // Verificación por cruces por cero: 1000 Hz durante 3 s = 3000 ciclos = ~6000 cruces por cero
    let zeroCrossings = 0;
    for (let n = 1; n < win.length; n++) {
      const prev = win[n - 1] ?? 0;
      const curr = win[n] ?? 0;
      if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
        zeroCrossings++;
      }
    }
    // Margen de tolerancia de +-4 cruces por cero en 144.000 muestras
    expect(zeroCrossings).toBeGreaterThanOrEqual(5996);
    expect(zeroCrossings).toBeLessThanOrEqual(6004);
  });
});
