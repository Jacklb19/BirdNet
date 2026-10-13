/**
 * What the inference worker loads for a person's choice of model and of decision rule (ADR-31), and the version
 * stored with what it detects.
 */
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { decisionRuleOf, modelInUse, type DetectionModel, type DetectionStyle } from './detectionChoices';
import { INFERENCE_WORKER_MESSAGES, type AlternateModel, type LoadModelRequest, type ModelManifest, type ModelSource } from './inference.types';
import { formatCombinedVersion, formatModelVersion, resolveManifestResource } from './modelManifest';

export interface DetectionChoices {
  readonly detectionModel?: DetectionModel;
  readonly detectionStyle?: DetectionStyle;
}

export interface LoadPlan {
  readonly request: LoadModelRequest;
  /** Identifier of the model, or pair of models, that classifies; stored with every detection. */
  readonly modelVersion: string;
  /** Classes the worker must report when a single model listens; null when two share a longer list. */
  readonly expectedClasses: number | null;
}

/**
 * @param alternate The second model as installed, or null when it is not.
 * @param resourceBase What the resource paths of both descriptions resolve against.
 */
export function planLoad(
  manifest: ModelManifest, alternate: AlternateModel | null, choices: DetectionChoices, resourceBase: string, origin: string,
): LoadPlan {
  const resolve = (path: string): string => resolveManifestResource(path, resourceBase, origin);
  const standard: ModelSource = {
    modelUrls: [resolve(manifest.model_file)], labelsUrl: resolve(manifest.labels_file),
    sampleRate: manifest.sample_rate, windowSamples: manifest.window_samples,
    ...(manifest.geo_model_file ? { geoModelUrl: resolve(manifest.geo_model_file) } : {}),
  };
  const preview: ModelSource | null = alternate && {
    modelUrls: alternate.model_files.map(resolve), labelsUrl: resolve(alternate.labels_file),
    sampleRate: alternate.sample_rate, windowSamples: alternate.window_samples, geoModelUrl: resolve(alternate.geo_model_file),
  };
  const use = modelInUse(choices.detectionModel, Boolean(preview));
  const plan = (models: readonly ModelSource[], modelSizeBytes: number, modelVersion: string, expectedClasses: number | null): LoadPlan => ({
    request: {
      type: INFERENCE_WORKER_MESSAGES.loadModel, models,
      capture: { sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE, windowSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES },
      modelSizeBytes, decisionRule: decisionRuleOf(choices.detectionStyle),
    },
    modelVersion, expectedClasses,
  });
  if (alternate && preview && use === 'preview') return plan([preview], alternate.size_bytes, formatModelVersion(alternate), alternate.num_classes);
  if (alternate && preview && use === 'combined') {
    return plan([standard, preview], manifest.size_bytes + alternate.size_bytes, formatCombinedVersion(manifest, alternate), null);
  }
  return plan([standard], manifest.size_bytes, formatModelVersion(manifest), manifest.num_classes);
}
