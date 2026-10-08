import { useEffect, useState } from 'react';
import { getAudio } from '../offline/queueStore';

export interface AudioFragment {
  readonly blob: Blob;
  /** Object URL for the audio element; revoked when the fragment is no longer shown. */
  readonly url: string;
}

/** The doubtful fragment kept on this phone for a record, or null when there is none (or it can no longer be read). */
export function useAudioFragment(audioId: string | null): AudioFragment | null {
  const [loaded, setLoaded] = useState<{ readonly audioId: string; readonly fragment: AudioFragment } | null>(null);

  useEffect(() => {
    if (!audioId || typeof indexedDB === 'undefined') return;
    let active = true;
    let url: string | null = null;
    // A fragment removed after upload simply leaves the detail without a player.
    getAudio(audioId).then((audio) => {
      if (!active || !audio) return;
      url = URL.createObjectURL(audio.blob);
      setLoaded({ audioId, fragment: { blob: audio.blob, url } });
    }).catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioId]);

  return loaded && loaded.audioId === audioId ? loaded.fragment : null;
}
