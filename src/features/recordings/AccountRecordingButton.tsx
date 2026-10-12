import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { fetchRecordingUrl } from './recordingsApi';
import './AccountRecordingButton.css';

export interface AccountRecordingButtonProps {
  readonly detectionId: string;
  /** Session token of the account that owns the recording. */
  readonly token: string;
  readonly labels: { readonly play: string; readonly stop: string; readonly failed: string };
}

/**
 * Plays a recording that is kept only in the account (made on another phone, or already dropped from this one).
 * The signed address is asked for when the person presses play, because it lasts a few minutes.
 */
export function AccountRecordingButton({ detectionId, token, labels }: AccountRecordingButtonProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'failed'>('idle');

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const stop = (): void => {
    audioRef.current?.pause();
    audioRef.current = null;
    setState('idle');
  };

  const play = async (): Promise<void> => {
    setState('loading');
    try {
      const audio = new Audio(await fetchRecordingUrl(token, detectionId));
      audio.onended = stop;
      audio.onerror = () => { setState('failed'); };
      audioRef.current = audio;
      await audio.play();
      setState('playing');
    } catch {
      setState('failed');
    }
  };

  const playing = state === 'playing';
  return (
    <span className="bn-account-recording">
      <button type="button" className="bn-account-recording__button" disabled={state === 'loading'} aria-label={playing ? labels.stop : labels.play}
        onClick={() => { if (playing) stop(); else void play(); }}>
        <Icon name={playing ? 'pause' : 'play'} size="s" />
      </button>
      {state === 'failed' && <span className="bn-account-recording__error" role="alert">{labels.failed}</span>}
    </span>
  );
}
