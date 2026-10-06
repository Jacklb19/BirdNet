import { afterAll, describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ort from 'onnxruntime-web';
import { normalizeAudio } from '../audio/dsp/normalize';
import { extractTopDetections } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';

interface AudioMetadata {
  species_scientific: string;
  filename: string;
  sample_rate: number;
  best_window_offset_sec: number;
}

function readWavSamples(filePath: string): Float32Array {
  const buffer = fs.readFileSync(filePath);
  const dataIndex = buffer.indexOf('data');
  if (dataIndex === -1) throw new Error('Reference WAV has no data chunk.');
  const start = dataIndex + 8;
  return Float32Array.from({ length: Math.floor((buffer.length - start) / 2) },
    (_, index) => buffer.readInt16LE(start + index * 2) / 32768);
}

const modelPath = path.resolve('public/models/birdnet_model.onnx');

describe.runIf(fs.existsSync(modelPath))('Real BirdNET inference and confidence policy', () => {
  let session: ort.InferenceSession | null = null;
  let labels: string[];
  let metadata: AudioMetadata[];

  afterAll(async () => { await session?.release(); });

  it('loads the actual quantized model and reference labels', async () => {
    labels = fs.readFileSync(path.resolve('public/models/labels.txt'), 'utf8').split('\n').map((label) => label.trim()).filter(Boolean);
    metadata = JSON.parse(fs.readFileSync(path.resolve('public/test-audio/metadata.json'), 'utf8')) as AudioMetadata[];
    expect(labels).toHaveLength(6522);
    expect(metadata.length).toBeGreaterThanOrEqual(4);
    session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
    expect(session.inputNames).toContain('input');
    expect(session.outputNames).toContain('output');
  });

  it('classifies four normalized reference windows with the production policy below 1500 ms', async () => {
    if (!session) throw new Error('Reference model did not load.');
    for (const reference of metadata) {
      const filePath = path.resolve('public/test-audio', reference.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const samples = readWavSamples(filePath);
      const offset = Math.floor(reference.best_window_offset_sec * reference.sample_rate);
      const window = samples.slice(offset, offset + 144000);
      expect(window).toHaveLength(144000);
      normalizeAudio(window, 0.95, true);
      const startedAt = performance.now();
      const input = new ort.Tensor('float32', window, [1, 144000]);
      const outputs = await session.run({ input });
      const output = outputs.output;
      if (!output) throw new Error('Missing classifier output.');
      const candidates = extractTopDetections(output.data as Float32Array, 1, 0.45, labels);
      const detections = applyDetectionPolicy(candidates);
      expect(performance.now() - startedAt).toBeLessThan(1500);
      expect(detections[0]?.scientificName).toBe(reference.species_scientific);
      expect(detections[0]?.status).toBe('confirmed_local');
      expect(detections[0]?.confidence).toBeGreaterThan(0.8);
      expect(detections[0]?.confidence).toBeLessThan(1);
      input.dispose();
      output.dispose();
    }
  });
});
