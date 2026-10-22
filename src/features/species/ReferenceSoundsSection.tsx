import { useEffect, useId, useRef, useState } from 'react';
import { formatSeconds, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { WAVEFORM_BAR_GAP, WAVEFORM_BARS } from '../log/log.config';
import { useWaveform } from '../log/useWaveform';
import { useOnline } from '../offline/useQueueStatus';
import { fetchReferenceSounds, soundKind, type ReferenceSound, type ReferenceSounds } from './referenceSounds';
import './ReferenceSoundsSection.css';

type SoundsState = { readonly status: 'loading' | 'unavailable' } | { readonly status: 'loaded'; readonly value: ReferenceSounds };
type AudioState = { readonly status: 'idle' | 'loading' | 'failed' } | { readonly status: 'ready'; readonly blob: Blob; readonly url: string };

function Waveform({ blob, progress }: { readonly blob: Blob; readonly progress: number }): React.JSX.Element | null {
  const peaks = useWaveform(blob, WAVEFORM_BARS);
  if (!peaks) return null;
  const played = Math.round(progress * peaks.length);
  return (
    <svg className="bn-reference-sound__wave" viewBox={`0 0 ${String(WAVEFORM_BARS)} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {peaks.map((peak, index) => (
        <rect key={index} className={index < played ? 'bn-reference-sound__bar bn-reference-sound__bar--played' : 'bn-reference-sound__bar'}
          x={index + WAVEFORM_BAR_GAP / 2} width={1 - WAVEFORM_BAR_GAP} y={(1 - peak) / 2} height={peak} />
      ))}
    </svg>
  );
}

/**
 * One recording: nothing is downloaded until the person presses play. The file comes from xeno-canto into memory and
 * plays from there, so its waveform can be drawn on the phone.
 */
function SoundPlayer({ sound }: { readonly sound: ReferenceSound }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.card.sounds;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audio, setAudio] = useState<AudioState>({ status: 'idle' });
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const type = texts.types[soundKind(sound.type)];
  const length = formatSeconds(sound.lengthSeconds, locale, 0);

  useEffect(() => () => { if (audio.status === 'ready') URL.revokeObjectURL(audio.url); }, [audio]);

  const toggle = async (): Promise<void> => {
    if (audio.status === 'loading') return;
    if (audio.status === 'ready') {
      const element = audioRef.current;
      if (element?.paused) await element.play().catch(() => { setAudio({ status: 'failed' }); });
      else element?.pause();
      return;
    }
    setAudio({ status: 'loading' });
    try {
      const response = await fetch(sound.audioUrl, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`xeno-canto answered ${String(response.status)}`);
      const blob = await response.blob();
      setAudio({ status: 'ready', blob, url: URL.createObjectURL(blob) });
    } catch {
      setAudio({ status: 'failed' });
    }
  };

  return (
    <li className="bn-reference-sound">
      <div className="bn-reference-sound__player">
        <button type="button" className="bn-reference-sound__toggle" aria-label={playing ? texts.pause : texts.play(type, length)}
          aria-busy={audio.status === 'loading'} disabled={audio.status === 'failed'} onClick={() => { void toggle(); }}>
          <Icon name={playing ? 'pause' : 'play'} size="s" />
        </button>
        <div className="bn-reference-sound__body">
          <p className="bn-reference-sound__meta">{texts.meta(type, length, sound.country)}</p>
          {audio.status === 'ready' && <Waveform blob={audio.blob} progress={progress} />}
          {audio.status === 'loading' && <p className="bn-reference-sound__status" role="status">{texts.loadingAudio}</p>}
        </div>
      </div>
      {audio.status === 'ready' && (
        <audio ref={audioRef} src={audio.url} autoPlay
          onPlay={() => { setPlaying(true); }} onPause={() => { setPlaying(false); }}
          onEnded={(event) => { setPlaying(false); setProgress(0); event.currentTarget.currentTime = 0; }}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setProgress(Number.isFinite(element.duration) && element.duration > 0 ? element.currentTime / element.duration : 0);
          }}
          onError={() => { setAudio({ status: 'failed' }); }} />
      )}
      {audio.status === 'failed' && <p className="bn-reference-sound__status" role="alert">{texts.playError}</p>}
      <p className="bn-reference-sound__credit">
        {texts.credit(sound.recordist, sound.id)}{dict.common.separator}
        <a href={sound.license.url} target="_blank" rel="noopener noreferrer license">{sound.license.code}</a>{dict.common.separator}
        <a href={sound.pageUrl} target="_blank" rel="noopener noreferrer">{texts.open}</a>
      </p>
    </li>
  );
}

/** "How it sings" in the guide (ADR-42): reference recordings of other people, said to be so, with their credits. */
export function ReferenceSoundsSection({ species }: { readonly species: string }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.species.card.sounds;
  const online = useOnline();
  const headingId = useId();
  const [state, setState] = useState<{ readonly species: string; readonly value: SoundsState } | null>(null);
  const current: SoundsState = state?.species === species ? state.value : { status: 'loading' };

  useEffect(() => {
    if (!online) return;
    let active = true;
    fetchReferenceSounds(species)
      .then((value) => { if (active) setState({ species, value: { status: 'loaded', value } }); })
      .catch(() => { if (active) setState({ species, value: { status: 'unavailable' } }); });
    return () => { active = false; };
  }, [species, online]);

  return (
    <section className="bn-species-page__card bn-reference-sounds" aria-labelledby={headingId}>
      <h2 id={headingId} className="bn-species-page__title label">{texts.title}</h2>
      <p className="bn-species-page__muted">{texts.intro}</p>
      {!online && current.status !== 'loaded' && <p className="bn-species-page__muted">{texts.offline}</p>}
      {online && current.status === 'loading' && <p className="bn-species-page__muted" role="status">{dict.common.loading}</p>}
      {current.status === 'unavailable' && <p className="bn-species-page__muted">{texts.unavailable}</p>}
      {current.status === 'loaded' && current.value.restricted && <p className="bn-species-page__muted">{texts.restricted}</p>}
      {current.status === 'loaded' && !current.value.restricted && current.value.sounds.length === 0 && (
        <p className="bn-species-page__muted">{texts.none}</p>
      )}
      {current.status === 'loaded' && current.value.sounds.length > 0 && (
        <>
          <ul className="bn-reference-sounds__list">
            {current.value.sounds.map((sound) => <SoundPlayer key={sound.id} sound={sound} />)}
          </ul>
          <p className="bn-species-page__muted">{texts.source}</p>
        </>
      )}
    </section>
  );
}
