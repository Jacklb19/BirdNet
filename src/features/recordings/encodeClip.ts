import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, Output, Quality, WebMOutputFormat } from 'mediabunny';
import { RECORDING_BITRATE, RECORDING_CODEC, RECORDING_MIME_TYPE } from './recordings.config';

const CHANNELS = 1;

/** Whether this browser can compress clips (WebCodecs with an Opus encoder); without it no clip is kept. */
export async function canEncodeClips(sampleRate: number): Promise<boolean> {
  try {
    return await canEncodeAudio(RECORDING_CODEC, { numberOfChannels: CHANNELS, sampleRate });
  } catch {
    return false;
  }
}

/** Compresses one analysis window (mono samples between -1 and 1) to Opus in a WebM container. */
export async function encodeClip(samples: Float32Array, sampleRate: number): Promise<Blob> {
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new AudioSampleSource({ codec: RECORDING_CODEC, quality: new Quality({ bitrate: RECORDING_BITRATE }) });
  output.addAudioTrack(source);
  await output.start();
  const sample = new AudioSample({ data: samples, format: 'f32', numberOfChannels: CHANNELS, sampleRate, timestamp: 0 });
  try {
    await source.add(sample);
  } finally {
    sample.close();
  }
  await output.finalize();
  if (!target.buffer) throw new Error('Clip could not be encoded.');
  return new Blob([target.buffer], { type: RECORDING_MIME_TYPE });
}
