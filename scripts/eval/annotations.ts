/**
 * Labels of the evaluation set. Each recording has an Audacity label track next to it (File → Export → Export
 * Labels): one line per sound, `start<TAB>end<TAB>scientific name`, times in seconds. A name ending in `?` is a
 * sound the annotator could not identify with certainty; it is kept so that it is neither demanded from the
 * detector nor held against it.
 */

/** One annotated sound of a recording. */
export interface Annotation {
  readonly species: string;
  /** Seconds from the start of the recording. */
  readonly start: number;
  readonly end: number;
  readonly uncertain: boolean;
}

const FIELD_SEPARATOR = '\t';
const UNCERTAIN_SUFFIX = '?';
/** Audacity writes the frequency range of a spectral selection on a second line that starts with a backslash. */
const SPECTRAL_LINE_PREFIX = '\\';

/** Audacity writes numbers in the locale of the computer, so the decimal separator may be a comma. */
function parseSeconds(field: string | undefined): number {
  const value = Number((field ?? '').trim().replace(',', '.'));
  if ((field ?? '').trim() === '' || !Number.isFinite(value) || value < 0) throw new Error('Invalid label time.');
  return value;
}

export function parseAudacityLabels(text: string): Annotation[] {
  return text.split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith(SPECTRAL_LINE_PREFIX))
    .map((line) => {
      const [startField, endField, labelField] = line.split(FIELD_SEPARATOR);
      const start = parseSeconds(startField);
      const end = parseSeconds(endField);
      const label = (labelField ?? '').trim();
      const uncertain = label.endsWith(UNCERTAIN_SUFFIX);
      const species = (uncertain ? label.slice(0, -UNCERTAIN_SUFFIX.length) : label).trim();
      if (end < start || species === '') throw new Error(`Invalid label line: ${line}`);
      return { species, start, end, uncertain };
    });
}
