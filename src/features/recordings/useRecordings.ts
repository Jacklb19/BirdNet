import { useEffect, useState } from 'react';
import { useQueueVersion } from '../offline/useQueueVersion';
import { getRecording, listRecordings } from './recordingStore';
import { fetchRecordingUsage, type RecordingUsage } from './recordingsApi';
import type { RecordingUpload } from './types';

/** A clip ready for the audio element. */
export interface LocalRecording {
  readonly blob: Blob;
  /** Object URL for the audio element; revoked when the clip is no longer shown. */
  readonly url: string;
  readonly upload: RecordingUpload;
}

/** The clip kept on this phone for a detection, or null when there is none (or it can no longer be read). */
export function useLocalRecording(detectionId: string): LocalRecording | null {
  const version = useQueueVersion('recordings');
  const [loaded, setLoaded] = useState<{ readonly key: string; readonly recording: LocalRecording | null } | null>(null);
  const key = `${detectionId}:${String(version)}`;

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    let url: string | null = null;
    getRecording(detectionId).then((clip) => {
      if (!active) return;
      if (!clip) { setLoaded({ key, recording: null }); return; }
      url = URL.createObjectURL(clip.blob);
      setLoaded({ key, recording: { blob: clip.blob, url, upload: clip.upload } });
    }).catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [detectionId, key]);

  return loaded && loaded.key === key ? loaded.recording : null;
}

export interface LocalRecordingUsage {
  readonly recordings: number;
  readonly bytes: number;
  /** Ids of the detections that keep a clip on this phone. */
  readonly ids: ReadonlySet<string>;
}

/** How many clips this phone keeps and what they weigh; null while it is being read. */
export function useLocalRecordingUsage(): LocalRecordingUsage | null {
  const version = useQueueVersion('recordings');
  const [usage, setUsage] = useState<LocalRecordingUsage | null>(null);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    listRecordings().then((clips) => {
      if (active) setUsage({ recordings: clips.length, bytes: clips.reduce((sum, clip) => sum + clip.bytes, 0), ids: new Set(clips.map((clip) => clip.id)) });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [version]);

  return usage;
}

export type AccountRecordingUsage =
  | { readonly status: 'idle' | 'loading' | 'unavailable' }
  | { readonly status: 'ready'; readonly usage: RecordingUsage };

/**
 * What the account's recordings take of its quota. Asked again whenever a clip on this phone changes (an upload
 * that finished) and whenever `refresh` changes (after deleting them).
 */
export function useAccountRecordingUsage(token: string | null, online: boolean, refresh = 0): AccountRecordingUsage {
  const version = useQueueVersion('recordings');
  const [found, setFound] = useState<{ readonly key: string; readonly state: AccountRecordingUsage } | null>(null);
  const key = `${token ?? ''}:${String(version)}:${String(refresh)}`;

  useEffect(() => {
    if (!token || !online) return;
    const controller = new AbortController();
    fetchRecordingUsage(token, controller.signal)
      .then((usage) => { setFound({ key, state: { status: 'ready', usage } }); })
      .catch(() => { if (!controller.signal.aborted) setFound({ key, state: { status: 'unavailable' } }); });
    return () => { controller.abort(); };
  }, [token, online, key]);

  if (!token) return { status: 'idle' };
  if (found?.key === key) return found.state;
  return online ? { status: 'loading' } : { status: 'unavailable' };
}
