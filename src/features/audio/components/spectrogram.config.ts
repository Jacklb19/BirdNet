import { AUDIO_CONSTANTS } from '../dsp/audio.constants';

/**
 * Seconds of sound kept on screen: eight analysis hops, enough to see a song phrase repeat while a single
 * call is still wide enough to read on a phone.
 */
export const SPECTROGRAM_HISTORY_SECONDS = 12;

/** STFT frames per second of audio; each frame is one column of the picture. */
const FRAMES_PER_SECOND = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE / AUDIO_CONSTANTS.STFT_HOP_LENGTH;

/** Columns of the history ring. */
export const SPECTROGRAM_HISTORY_COLUMNS = Math.round(SPECTROGRAM_HISTORY_SECONDS * FRAMES_PER_SECOND);

/** Frames a window adds after the previous one: windows overlap, so only one hop of its audio is new. */
export const SPECTROGRAM_FRAMES_PER_HOP = Math.round(AUDIO_CONSTANTS.HOP_SAMPLES / AUDIO_CONSTANTS.STFT_HOP_LENGTH);

/**
 * Intensity levels of the colour ramp: more steps than the eye separates between four token colours, few
 * enough to store each pixel's level in a byte.
 */
export const SPECTROGRAM_COLOR_STEPS = 64;

/** Frequency labels on the axis; three mark low, middle and high song without crowding a phone-sized card. */
export const SPECTROGRAM_FREQUENCY_TICKS = 3;

/** Labels are rounded to whole kilohertz, the precision a glance at the axis needs. */
export const SPECTROGRAM_TICK_STEP_HZ = 1000;

/** Sonogram tokens of src/styles/tokens.css, read at draw time so both themes paint with their own palette. */
export const SONOGRAM_TOKENS = Object.freeze({
  faint: '--color-sono-faint',
  mid: '--color-sono-mid',
  ink: '--color-sono-ink',
  mark: '--color-sono-mark',
});
