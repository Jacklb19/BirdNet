/** Tunable behavior of the log screens. */

/**
 * Rows rendered before "show more". A morning of listening can produce hundreds of detections; rendering them all
 * at once means hundreds of photo lookups and a long first paint on a phone, while a page this size still covers
 * a typical day.
 */
export const LOG_PAGE_SIZE = 50;

/**
 * Times of the log use the 24-hour clock, as field notes do: dawn and dusk choruses read without "a. m./p. m.",
 * and the time column stays narrow enough on a 360 px phone for the species name to keep its width.
 */
export const LOG_TIME_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Confidence is shown as a whole percent: the model's decimals suggest a precision it does not have. */
export const CONFIDENCE_FRACTION_DIGITS = 0;

/** A fragment's length in whole seconds: every fragment is exactly one analysis window. */
export const DURATION_FRACTION_DIGITS = 0;

/** Bars of the fragment waveform: enough to show where the call is in the window, and still distinct at 360 px. */
export const WAVEFORM_BARS = 32;

/** Height of a silent bar, as a share of the loudest one, so quiet stretches still read as part of the fragment. */
export const WAVEFORM_MIN_BAR = 0.08;

/** Share of each bar slot left empty between bars. */
export const WAVEFORM_BAR_GAP = 0.35;

/** Walks listed in the log's summary; the map shows them all. */
export const LOG_WALKS_SHOWN = 3;

/** New species of the week named in the log's summary; the figure beside them counts them all. */
export const LOG_NEW_SPECIES_SHOWN = 6;
