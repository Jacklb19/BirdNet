import { useRef, useState } from 'react';
import { useI18n, formatSeconds } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { DURATION_FRACTION_DIGITS, WAVEFORM_BAR_GAP, WAVEFORM_BARS } from './log.config';
import type { AudioFragment } from './useAudioFragment';
import { useWaveform } from './useWaveform';
import './FragmentPlayer.css';

export interface FragmentPlayerProps {
  readonly fragment: AudioFragment;
}

/** Pausing before playback starts rejects `play()` with this; it is not a failure of the fragment. */
function isInterruptedPlay(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Plays the doubtful fragment kept on this phone; it never leaves the device from here. */
export function FragmentPlayer({ fragment }: FragmentPlayerProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const peaks = useWaveform(fragment.blob, WAVEFORM_BARS);
  const duration = formatSeconds(AUDIO_CONSTANTS.WINDOW_DURATION_SEC, locale, DURATION_FRACTION_DIGITS);
  const texts = dict.log.detail.fragment;

  const toggle = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch((error: unknown) => { if (!isInterruptedPlay(error)) setFailed(true); });
    else audio.pause();
  };

  const track = (audio: HTMLAudioElement): void => {
    setProgress(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0);
  };

  const played = peaks ? Math.round(progress * peaks.length) : 0;
  return (
    <div className="bn-log-fragment">
      <button type="button" className="bn-log-fragment__toggle" onClick={toggle} disabled={failed} aria-label={playing ? texts.pause : texts.play(duration)}>
        <Icon name={playing ? 'pause' : 'play'} size="s" />
      </button>
      {/* Decorative: the waveform only shows where in the window the sound is; the button carries the meaning. */}
      <svg className="bn-log-fragment__wave" viewBox={`0 0 ${String(WAVEFORM_BARS)} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {peaks?.map((peak, index) => (
          <rect key={index} className={index < played ? 'bn-log-fragment__bar bn-log-fragment__bar--played' : 'bn-log-fragment__bar'}
            x={index + WAVEFORM_BAR_GAP / 2} width={1 - WAVEFORM_BAR_GAP} y={(1 - peak) / 2} height={peak} />
        ))}
      </svg>
      <span className="bn-log-fragment__duration" aria-hidden="true">{duration}</span>
      <audio ref={audioRef} src={fragment.url} preload="metadata"
        onPlay={() => { setPlaying(true); }} onPause={() => { setPlaying(false); }}
        onEnded={(event) => { setPlaying(false); setProgress(0); event.currentTarget.currentTime = 0; }}
        onTimeUpdate={(event) => { track(event.currentTarget); }} onError={() => { setFailed(true); }} />
      {failed && <p className="bn-log-fragment__error" role="alert">{texts.error}</p>}
    </div>
  );
}
