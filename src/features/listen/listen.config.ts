/**
 * How often relative times ("2 min ago") refresh. Their unit is the minute, so four refreshes a minute keep
 * them within seconds of the truth without re-rendering the list every second.
 */
export const HEARD_AGO_REFRESH_MS = 15_000;

/** Confidence is shown as a whole percentage, the precision a model score warrants on screen. */
export const CONFIDENCE_FRACTION_DIGITS = 0;

/** The spectrogram's time span is a round number of seconds, so its description uses whole seconds. */
export const SPECTROGRAM_SPAN_FRACTION_DIGITS = 0;

/** The clock in the listening context shows minutes, so it refreshes a few times a minute. */
export const CONTEXT_CLOCK_REFRESH_MS = 20_000;

/** Latest album stickers shown beside the plate while no session is running (two rows of three). */
export const RECENT_ALBUM_COUNT = 6;

/** Likely birds of the area still to hear, shown beside the plate while no session is running (two rows of three). */
export const LIKELY_BIRDS_COUNT = 6;
