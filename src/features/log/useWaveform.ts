import { useEffect, useState } from 'react';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { waveformPeaks } from './waveform';

/** One frame is the smallest valid offline context; it is only used to decode, never to render. */
const DECODE_CONTEXT_FRAMES = 1;

/** Peaks of the stored fragment, decoded on this device; null until decoded or when the browser cannot decode it. */
export function useWaveform(blob: Blob, bars: number): readonly number[] | null {
  const [decoded, setDecoded] = useState<{ readonly blob: Blob; readonly peaks: readonly number[] } | null>(null);

  useEffect(() => {
    if (typeof OfflineAudioContext === 'undefined') return;
    let active = true;
    const context = new OfflineAudioContext(1, DECODE_CONTEXT_FRAMES, AUDIO_CONSTANTS.TARGET_SAMPLE_RATE);
    // Without a waveform the player still works; the drawing is only a guide to where the call is.
    blob.arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((audio) => { if (active) setDecoded({ blob, peaks: waveformPeaks(audio.getChannelData(0), bars) }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [blob, bars]);

  return decoded && decoded.blob === blob ? decoded.peaks : null;
}
