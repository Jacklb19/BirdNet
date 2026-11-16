import { useEffect, useId, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { formatDayTime } from '../log/logFormat';
import { getRecording } from '../recordings/recordingStore';
import { fetchRecordingUrl } from '../recordings/recordingsApi';
import './OwnRecordings.css';

export interface OwnRecording {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly at: number;
  /** Where the clip is: on this phone (played from its Blob) or only in the account (played from a signed address). */
  readonly source: 'phone' | 'account';
}

type Playback = { readonly id: string; readonly state: 'loading' | 'playing' } | { readonly id: string; readonly state: 'failed' } | null;

/**
 * The person's own recordings of one species (ADR-28, ADR-47): only the clips that exist, newest first, with one
 * player for all of them. A clip is read only when it is played (its Blob from this phone, or a short-lived signed
 * address from the account), so opening the card never loads every recording at once.
 */
export function OwnRecordings({ recordings, token, now }: { readonly recordings: readonly OwnRecording[]; readonly token: string | null; readonly now: Date }): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const texts = dict.species.recordings;
  const titleId = useId();
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const request = useRef(0);
  const [playback, setPlayback] = useState<Playback>(null);

  const release = (): void => {
    audio.current?.pause();
    audio.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(() => release, []);

  const stop = (): void => { request.current += 1; release(); setPlayback(null); };
  const play = async (recording: OwnRecording): Promise<void> => {
    const current = ++request.current;
    release();
    setPlayback({ id: recording.id, state: 'loading' });
    try {
      let source: string;
      if (recording.source === 'phone') {
        const clip = await getRecording(recording.id);
        if (!clip) throw new Error('The clip is no longer on this phone.');
        source = URL.createObjectURL(clip.blob);
        objectUrl.current = source;
      } else {
        if (!token) throw new Error('No session to sign the address with.');
        source = await fetchRecordingUrl(token, recording.id);
      }
      // A later press (or leaving the card) supersedes this one.
      if (current !== request.current) return;
      const element = new Audio(source);
      element.onended = stop;
      element.onerror = () => { if (current === request.current) setPlayback({ id: recording.id, state: 'failed' }); };
      audio.current = element;
      await element.play();
      if (current === request.current) setPlayback({ id: recording.id, state: 'playing' });
    } catch {
      if (current === request.current) { release(); setPlayback({ id: recording.id, state: 'failed' }); }
    }
  };

  if (!recordings.length) return null;
  return (
    <section className="bn-species-page__card bn-own-recordings" aria-labelledby={titleId}>
      <h3 id={titleId} className="bn-species-page__title label">{texts.title}</h3>
      <ul className="bn-own-recordings__list">
        {recordings.map((recording) => {
          const mine = playback?.id === recording.id ? playback : null;
          const playing = mine?.state === 'playing';
          const when = formatDayTime(recording.at, now, locale);
          return (
            <li key={recording.id} className="bn-own-recordings__item">
              <button type="button" className="bn-own-recordings__play" aria-busy={mine?.state === 'loading' || undefined}
                aria-label={playing ? texts.stop(when) : texts.play(when)} onClick={() => { if (playing) stop(); else void play(recording); }}>
                <Icon name={playing ? 'pause' : 'play'} size="s" />
              </button>
              <a className="bn-own-recordings__text" href={routeHash({ name: 'detection', id: recording.id })}>
                <span>{when}</span>
                <span className="bn-own-recordings__where">{recording.source === 'phone' ? texts.onPhone : texts.inAccount}</span>
              </a>
              {mine?.state === 'failed' && <span className="bn-own-recordings__error" role="alert">{texts.failed}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
