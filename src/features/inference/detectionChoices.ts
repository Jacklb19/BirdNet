/**
 * What a person can choose about how the app detects (ADR-31): which acoustic model listens and whether a doubtful
 * call has to be heard twice. Both are stored with the other settings and take effect when listening starts.
 */
import { DECISION_RULE } from './inference.constants';
import { SINGLE_WINDOW, type PoolingRule } from './windowPooling';

/** `standard` is the model every installation has; `preview` the newer one a person may add; `combined` both. */
export const DETECTION_MODELS = ['standard', 'preview', 'combined'] as const;
export type DetectionModel = (typeof DETECTION_MODELS)[number];
export const DEFAULT_DETECTION_MODEL: DetectionModel = 'standard';

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

/** The model that actually listens: a choice that needs the preview model falls back until it is installed. */
export function modelInUse(choice: DetectionModel | undefined, previewInstalled: boolean): DetectionModel {
  return choice && previewInstalled ? choice : DEFAULT_DETECTION_MODEL;
}

export function decisionRuleOf(style: DetectionStyle | undefined): PoolingRule {
  return (style ?? DEFAULT_DETECTION_STYLE) === 'wide' ? SINGLE_WINDOW : DECISION_RULE;
}
