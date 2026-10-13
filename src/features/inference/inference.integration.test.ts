import { afterAll, describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ort from 'onnxruntime-web';
import { normalizeAudio } from '../audio/dsp/normalize';
import { resampleBandLimited } from '../audio/dsp/bandLimitedResample';
import productionManifest from '../../../public/models/manifest.json';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import { extractTopDetections, parseLabelsFile } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';
import { INPUT_BATCH_SIZE, MIN_CANDIDATE_CONFIDENCE, createSessionOptions } from './inference.constants';

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
    labels = parseLabelsFile(fs.readFileSync(path.resolve('public/models/labels.txt'), 'utf8'));
    metadata = JSON.parse(fs.readFileSync(path.resolve('public/test-audio/metadata.json'), 'utf8')) as AudioMetadata[];
    expect(labels).toHaveLength(6522);
    expect(metadata.length).toBeGreaterThanOrEqual(4);
    // The production options, so a runtime that rejects them fails here instead of in the browser.
    session = await ort.InferenceSession.create(modelPath, createSessionOptions());
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
      const window = samples.slice(offset, offset + AUDIO_CONSTANTS.WINDOW_SAMPLES);
      expect(window).toHaveLength(AUDIO_CONSTANTS.WINDOW_SAMPLES);
      normalizeAudio(window, AUDIO_CONSTANTS.NORMALIZATION_TARGET_PEAK, true);
      const startedAt = performance.now();
      const input = new ort.Tensor('float32', window, [INPUT_BATCH_SIZE, AUDIO_CONSTANTS.WINDOW_SAMPLES]);
      const outputs = await session.run({ input });
      const output = outputs.output;
      if (!output) throw new Error('Missing classifier output.');
      const candidates = extractTopDetections(output.data as Float32Array, 1, MIN_CANDIDATE_CONFIDENCE, labels);
      const detections = applyDetectionPolicy(candidates);
      expect(performance.now() - startedAt).toBeLessThan(1500);
      expect(detections[0]?.scientificName).toBe(reference.species_scientific);
      expect(detections[0]?.status).toBe('confirmed_local');
      expect(detections[0]?.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.confirmedFrom);
      expect(detections[0]?.confidence).toBeLessThan(1);
      input.dispose();
      output.dispose();
    }
  });
});

const plusManifest = productionManifest.alternate;
const plusParts = plusManifest.model_files.map((file) => path.resolve('public/models', file));
/** Reading and compiling a 64 MB model takes most of the default time of a test when the suite runs in parallel. */
const PLUS_TEST_TIMEOUT_MS = 60_000;
/** Species BirdNET+ names after a taxonomy that split them: the bird of the reference recording under its new name. */
const PLUS_NAMES: Readonly<Record<string, string>> = { 'Troglodytes aedon': 'Troglodytes musculus' };

describe.runIf(plusParts.every((part) => fs.existsSync(part)))('Real BirdNET+ inference on a resampled window', () => {
  let session: ort.InferenceSession | null = null;

  afterAll(async () => { await session?.release(); });

  it('hears the reference birds in the window the capture pipeline delivers, joined from its parts', async () => {
    const labels = parseLabelsFile(fs.readFileSync(path.resolve('public/models', plusManifest.labels_file), 'utf8'));
    expect(labels).toHaveLength(plusManifest.num_classes);
    // Copied into an array of this realm: the runtime does not recognise a Node buffer from the test environment.
    const whole = Uint8Array.from(Buffer.concat(plusParts.map((part) => fs.readFileSync(part))));
    session = await ort.InferenceSession.create(whole, createSessionOptions());
    const [inputName] = session.inputNames;
    const [outputName] = session.outputNames;
    if (!inputName || !outputName || session.outputNames.length !== 1) throw new Error('Unexpected BirdNET+ tensors.');
    const metadata = JSON.parse(fs.readFileSync(path.resolve('public/test-audio/metadata.json'), 'utf8')) as AudioMetadata[];
    for (const reference of metadata) {
      const samples = readWavSamples(path.resolve('public/test-audio', reference.filename));
      const offset = Math.floor(reference.best_window_offset_sec * reference.sample_rate);
      const window = samples.slice(offset, offset + AUDIO_CONSTANTS.WINDOW_SAMPLES);
      normalizeAudio(window, AUDIO_CONSTANTS.NORMALIZATION_TARGET_PEAK, true);
      const resampled = resampleBandLimited(window, AUDIO_CONSTANTS.TARGET_SAMPLE_RATE, plusManifest.sample_rate);
      expect(resampled).toHaveLength(plusManifest.window_samples);
      const input = new ort.Tensor('float32', resampled, [INPUT_BATCH_SIZE, plusManifest.window_samples]);
      const output = (await session.run({ [inputName]: input }))[outputName];
      if (!output) throw new Error('Missing classifier output.');
      const [best] = extractTopDetections(output.data as Float32Array, 1, MIN_CANDIDATE_CONFIDENCE, labels);
      expect(best?.scientificName).toBe(PLUS_NAMES[reference.species_scientific] ?? reference.species_scientific);
      input.dispose();
      output.dispose();
    }
  }, PLUS_TEST_TIMEOUT_MS);
});
