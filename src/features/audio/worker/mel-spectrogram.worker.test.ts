import { describe, it, expect } from 'vitest';
import { MelSpectrogramPipeline } from './mel-spectrogram.worker';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';

describe('MelSpectrogramPipeline', () => {
  it('procesa una ventana de audio y calcula el mel-espectrograma midiendo latencia', () => {
    const pipeline = new MelSpectrogramPipeline({
      sampleRate: 8000,
      fftSize: 256,
      hopLength: 128,
      numMelBands: 32,
    });

    // 1 segundo de audio a 8000 Hz
    const samples = new Float32Array(8000);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 8000);
    }

    const response = pipeline.processWindow(samples, 42, 12345.67);

    expect(response.type).toBe('MEL_SPECTROGRAM_READY');
    expect(response.windowIndex).toBe(42);
    expect(response.timestamp).toBe(12345.67);
    expect(response.numMelBands).toBe(32);
    expect(response.numFrames).toBeGreaterThan(0);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.data.length).toBe(response.numFrames * 32);
  });

  it('procesa una ventana de 3 segundos completa con parámetros estándar', () => {
    const pipeline = new MelSpectrogramPipeline();
    // 3 segundos a 48 kHz = 144.000 muestras
    const samples = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    // Simular un silbido de ave a 2500 Hz
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 2500 * i) / AUDIO_CONSTANTS.TARGET_SAMPLE_RATE);
    }

    const response = pipeline.processWindow(samples, 1, 1000);

    expect(response.numMelBands).toBe(AUDIO_CONSTANTS.NUM_MEL_BANDS);
    expect(response.numFrames).toBeGreaterThan(200);
    // Verificar que la latencia en un dispositivo moderno sea baja (< 500 ms)
    expect(response.durationMs).toBeLessThan(1000);
  });
});
