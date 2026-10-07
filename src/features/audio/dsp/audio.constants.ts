/**
 * Acoustic parameters of the capture and DSP pipeline. Every other module, including the AudioWorklet
 * (through `processorOptions`), takes its values from here, so a change propagates everywhere.
 *
 * The sample rate and window length are the BirdNET model input contract and are checked against the
 * model manifest (`validateManifest`). The STFT and mel parameters only drive the on-screen spectrogram.
 */

/** Model input sample rate (Hz). */
const TARGET_SAMPLE_RATE = 48_000;
/** Analysis window length in seconds (RF-02); the model classifies exactly one window per run. */
const WINDOW_DURATION_SEC = 3;
/** Time between consecutive windows in seconds: 50 % overlap so a call cut by one window is whole in the next. */
const HOP_DURATION_SEC = 1.5;

/** Peak amplitude never scaled up: below it the window is treated as silence, so background hiss is not amplified. */
const SILENCE_THRESHOLD_RMS = 1e-4;

/** Factor of power-style decibels (10·log10), the scale `computeMelSpectrogram` emits. */
const POWER_DECIBEL_FACTOR = 10;
/** Factor of amplitude decibels (20·log10), the scale of dBFS meter readings. */
const AMPLITUDE_DECIBEL_FACTOR = 20;

/** Smallest mel energy before the logarithm, so silent bands give a finite value instead of -Infinity. */
const MEL_LOG_FLOOR = 1e-10;
/** Lowest value `computeMelSpectrogram` can emit: the log floor expressed in decibels. */
const MEL_LOG_FLOOR_DB = POWER_DECIBEL_FACTOR * Math.log10(MEL_LOG_FLOOR);

/** Loudest mel energy expected from a normalized window; louder bands saturate the colormap. */
const SPECTROGRAM_MAX_DB = 20;
/** Contrast shown below the maximum; quieter detail is drawn as background. */
const SPECTROGRAM_DYNAMIC_RANGE_DB = 80;

/** Converts a dBFS reading to linear full-scale amplitude (1 = 0 dBFS), the unit of level updates. */
function dbfsToAmplitude(dbfs: number): number {
  return 10 ** (dbfs / AMPLITUDE_DECIBEL_FACTOR);
}

/**
 * Microphone constraints. Browser voice processing is tuned for speech: echo cancellation and noise
 * suppression treat sustained high-pitched trills as noise and remove them, and automatic gain control
 * changes the level between windows, which changes what the classifier hears. The model takes one channel.
 */
const CAPTURE_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
}) satisfies MediaTrackConstraints;

export const AUDIO_CONSTANTS = Object.freeze({
  TARGET_SAMPLE_RATE,
  WINDOW_DURATION_SEC,
  HOP_DURATION_SEC,

  /** Samples per window at the target rate (3 s × 48 kHz = 144 000). */
  WINDOW_SAMPLES: Math.round(TARGET_SAMPLE_RATE * WINDOW_DURATION_SEC),

  /** Samples between consecutive windows at the target rate (1.5 s × 48 kHz = 72 000). */
  HOP_SAMPLES: Math.round(TARGET_SAMPLE_RATE * HOP_DURATION_SEC),

  /** FFT size of the spectrogram STFT (power of two). */
  FFT_SIZE: 1024,

  /** Hop between STFT frames in samples (50 % frame overlap). */
  STFT_HOP_LENGTH: 512,

  /** Number of triangular filters in the mel filterbank. */
  NUM_MEL_BANDS: 64,

  /** Lowest filterbank frequency (Hz): wind and handling rumble lie below it. */
  MIN_FREQUENCY_HZ: 150,

  /** Highest filterbank frequency (Hz): covers the fundamental and harmonics of most bird song. */
  MAX_FREQUENCY_HZ: 15_000,

  SILENCE_THRESHOLD_RMS,

  /** Peak after normalization; the headroom below full scale keeps the PCM16 fragment and model input unclipped. */
  NORMALIZATION_TARGET_PEAK: 0.95,

  /** Seconds between input level reports: about ten meter updates per second without flooding the main thread. */
  LEVEL_REPORT_INTERVAL_SEC: 0.1,

  /** Render quantum of the Web Audio API (samples per `process` call). */
  WORKLET_BLOCK_SIZE: 128,

  /** Name the AudioWorklet registers its processor under; the worklet file mirrors it and a test enforces the match. */
  WORKLET_PROCESSOR_NAME: 'audio-window-processor',

  CAPTURE_CONSTRAINTS,

  /** See `MEL_LOG_FLOOR`; `MEL_LOG_FLOOR_DB` is the matching lowest decibel value. */
  MEL_LOG_FLOOR,
  MEL_LOG_FLOOR_DB,
  POWER_DECIBEL_FACTOR,

  /** Colormap range of the spectrogram in the decibels `computeMelSpectrogram` emits; never below the log floor. */
  SPECTROGRAM_DB_RANGE: Object.freeze({
    min: Math.max(MEL_LOG_FLOOR_DB, SPECTROGRAM_MAX_DB - SPECTROGRAM_DYNAMIC_RANGE_DB),
    max: SPECTROGRAM_MAX_DB,
  }),

  /** Input meter bands, in the linear full-scale amplitude of level updates. */
  LEVEL_METER_THRESHOLDS: Object.freeze({
    /** Peak at or below the silence threshold: the window reaches the model unamplified, effectively silence. */
    silentPeak: SILENCE_THRESHOLD_RMS,
    /** RMS below about -40 dBFS reads as faint: distant calls are still analysed but tend to score lower. */
    faintRms: dbfsToAmplitude(-40),
    /** Peak from about -0.1 dBFS: the converter is at full scale and the input may clip. */
    clippingPeak: dbfsToAmplitude(-0.1),
  }),
} as const);
