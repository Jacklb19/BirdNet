import { useCallback } from 'react';
import { formatFrequency, formatKilohertz, formatSeconds, useI18n } from '../../i18n';
import { Spectrogram } from '../audio/components/Spectrogram';
import { SPECTROGRAM_HISTORY_SECONDS } from '../audio/components/spectrogram.config';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { SPECTROGRAM_SPAN_FRACTION_DIGITS } from './listen.config';
import { useListeningSignal } from './listeningContext';

export interface ListenSpectrogramProps {
  /** A session is running; otherwise the picture is the end of the last session. */
  readonly active: boolean;
}

/**
 * The session's spectrogram. Only this component reads the fast signal context, so the rest of the screen
 * re-renders once per analysed window, not with every level update.
 */
export function ListenSpectrogram({ active }: ListenSpectrogramProps): React.JSX.Element {
  const { latestSpectrogram } = useListeningSignal();
  const { dict, locale } = useI18n();
  const t = dict.listen.spectrogram;

  const formatTick = useCallback(
    (hz: number, withUnit: boolean): string => formatKilohertz(hz, locale, { withSymbol: withUnit }),
    [locale],
  );

  const low = formatFrequency(AUDIO_CONSTANTS.MIN_FREQUENCY_HZ, locale);
  const high = formatTick(AUDIO_CONSTANTS.MAX_FREQUENCY_HZ, true);
  // A stopped session's picture may hold less than the full span (the screen was opened after it started),
  // so only the live description states the span.
  let label = t.empty;
  if (latestSpectrogram) {
    label = active
      ? t.label(formatSeconds(SPECTROGRAM_HISTORY_SECONDS, locale, SPECTROGRAM_SPAN_FRACTION_DIGITS), low, high)
      : t.stopped(low, high);
  }

  return (
    <Spectrogram spectrogram={latestSpectrogram} label={label} formatFrequency={formatTick}
      placeholder={latestSpectrogram ? undefined : t.placeholder} />
  );
}
