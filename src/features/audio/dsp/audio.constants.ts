/**
 * Constantes y parámetros acústicos del sistema de captura y procesamiento.
 *
 * NOTA DE DISEÑO (S1 -> S2):
 * La tasa de muestreo, el tamaño de FFT, el número de bandas Mel y el rango de
 * frecuencias definidos a continuación son PROVISIONALES.
 * Deben confirmarse o ajustarse exactamente contra la especificación de entrada
 * del modelo preentrenado que se elija en el Sprint 2 (S2), antes de considerarse definitivos.
 */

export const AUDIO_CONSTANTS = {
  /** Frecuencia de muestreo objetivo estándar para modelos acústicos de aves (Hz) - PROVISIONAL */
  TARGET_SAMPLE_RATE: 48000,

  /** Duración de la ventana de análisis en segundos (RF-02) */
  WINDOW_DURATION_SEC: 3.0,

  /** Desplazamiento temporal entre ventanas consecutivas en segundos (solapamiento del 50%) */
  HOP_DURATION_SEC: 1.5,

  /** Cantidad de muestras por ventana a la tasa objetivo: 3.0 s * 48.000 Hz = 144.000 muestras */
  WINDOW_SAMPLES: 144000,

  /** Cantidad de muestras de desplazamiento entre ventanas: 1.5 s * 48.000 Hz = 72.000 muestras */
  HOP_SAMPLES: 72000,

  /** Tamaño de la FFT para el cálculo de STFT - PROVISIONAL */
  FFT_SIZE: 1024,

  /** Desplazamiento de trama en muestras para STFT - PROVISIONAL */
  STFT_HOP_LENGTH: 512,

  /** Número de filtros en el banco de frecuencias Mel - PROVISIONAL */
  NUM_MEL_BANDS: 64,

  /** Frecuencia mínima para el banco de filtros Mel en Hz (descarta ruido infrasónico) - PROVISIONAL */
  MIN_FREQUENCY_HZ: 150,

  /** Frecuencia máxima para el banco de filtros Mel en Hz (vocalizaciones de aves) - PROVISIONAL */
  MAX_FREQUENCY_HZ: 15000,

  /** Umbral de silencio mínimo para normalización (evita amplificar ruido de fondo en silencio absoluto) */
  SILENCE_THRESHOLD_RMS: 1e-4,

  /** Tamaño de bloque estándar de AudioWorklet (muestras por quantum) */
  WORKLET_BLOCK_SIZE: 128,
} as const;
