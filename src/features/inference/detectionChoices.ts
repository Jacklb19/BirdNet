/**
 * What a person can choose about how the app detects (ADR-31): which acoustic model listens and whether a doubtful
 * call has to be heard twice. Both are stored with the other settings and take effect when listening starts.
 */
import { DECISION_RULE } from './inference.constants';
import { SINGLE_WINDOW, type PoolingRule } from './windowPooling';

/** `standard` is the model every installation has; `preview` the newer one a person may add; `combined` both. */
export const DETECTION_MODELS = ['standard', 'preview', 'combined'] as const;
export type DetectionModel = (typeof DETECTION_MODELS)[number];
/**
 * What listens for someone who never chose (ADR-36): both models averaged, which found the most in the independent
 * recordings with as few false alarms as the first model alone. Until the second model is on the phone, or where the
 * phone proved too slow for both, the first one listens.
 */
export const DEFAULT_DETECTION_MODEL: DetectionModel = 'combined';
/** The model every installation has, and the one that listens whenever a choice cannot take effect. */
export const BASE_DETECTION_MODEL: DetectionModel = 'standard';
const NEEDS_SECOND_MODEL: readonly DetectionModel[] = ['preview', 'combined'];

export function needsSecondModel(model: DetectionModel): boolean {
  return NEEDS_SECOND_MODEL.includes(model);
}

/** `careful` decides with the window before (ADR-30); `wide` lets every window decide alone. */
export const DETECTION_STYLES = ['careful', 'wide'] as const;
export type DetectionStyle = (typeof DETECTION_STYLES)[number];
export const DEFAULT_DETECTION_STYLE: DetectionStyle = 'careful';

export function isDetectionModel(value: unknown): value is DetectionModel {
  return (DETECTION_MODELS as readonly unknown[]).includes(value);
}

export function isDetectionStyle(value: unknown): value is DetectionStyle {
  return (DETECTION_STYLES as readonly unknown[]).includes(value);
}

/**
 * The model that actually listens. A choice that needs the preview model falls back until it is installed. The default
 * also falls back on a phone that could not keep up with two models (`tooSlowForTwo`); a choice the person made does not.
 */
export function modelInUse(choice: DetectionModel | undefined, previewInstalled: boolean, tooSlowForTwo = false): DetectionModel {
  const wanted = choice ?? (tooSlowForTwo ? BASE_DETECTION_MODEL : DEFAULT_DETECTION_MODEL);
  return needsSecondModel(wanted) && !previewInstalled ? BASE_DETECTION_MODEL : wanted;
}

export function decisionRuleOf(style: DetectionStyle | undefined): PoolingRule {
  return (style ?? DEFAULT_DETECTION_STYLE) === 'wide' ? SINGLE_WINDOW : DECISION_RULE;
}
