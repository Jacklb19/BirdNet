import type { ApproximateLocation } from './types';

/** Round before persistence; raw device coordinates must never enter the queue. */
export function approximateLocation(latitude: number, longitude: number): ApproximateLocation {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Invalid location.');
  }
  return { latitude: Math.round(latitude * 1000) / 1000, longitude: Math.round(longitude * 1000) / 1000 };
}

/** Preserve every pending record by rejecting overflow before the transaction commits. */
export function assertQueueCapacity(current: number, addition: number, maximum: number): void {
  if (![current, addition, maximum].every(Number.isSafeInteger) || current < 0 || addition < 0 || maximum < 1024 * 1024 || current + addition > maximum) {
    throw new Error('Queue capacity exceeded.');
  }
}

/** WAV PCM16 is independent of the model's floating-point tensor representation. */
export function encodeAudio(samples: Float32Array): Blob {
  if (samples.length !== 144000 || samples.some((sample) => !Number.isFinite(sample))) throw new Error('Invalid audio.');
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string): void => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => { const value = Math.min(1, Math.max(-1, sample)); view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); });
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Untrusted acknowledgements must identify only records in the submitted batch. */
export function acknowledgedIds(response: unknown, submitted: readonly string[]): string[] {
  if (!response || typeof response !== 'object' || !('accepted_ids' in response) || !('existing_ids' in response)) throw new Error('Invalid acknowledgement.');
  const accepted: unknown = response.accepted_ids;
  const existing: unknown = response.existing_ids;
  if (!Array.isArray(accepted) || !Array.isArray(existing)) throw new Error('Invalid acknowledgement.');
  const ids: unknown[] = [...accepted as unknown[], ...existing as unknown[]];
  if (ids.some((id) => typeof id !== 'string' || !submitted.includes(id))) throw new Error('Unexpected acknowledgement.');
  return [...new Set(ids as string[])];
}
