import type { CSSProperties } from 'react';
import './ProgressBar.css';

export interface ProgressBarProps {
  /** Between 0 and 1; null when the total is unknown (the bar then shows activity without a value). */
  readonly ratio: number | null;
  readonly label: string;
  /** Spoken value, e.g. "12 of 64 MiB"; screen readers otherwise only hear a percentage. */
  readonly valueText?: string;
  /**
   * `progress` for a task moving toward completion (a download); `meter` for a level within a known range
   * (space used), which assistive technology must not announce as something about to finish.
   */
  readonly kind?: 'progress' | 'meter';
}

const PERCENT = 100;

const ROLES = Object.freeze({ progress: 'progressbar', meter: 'meter' } as const);

/** Thin bar for a known share (space used, bytes downloaded); announced only when someone reaches it. */
export function ProgressBar({ ratio, label, valueText, kind = 'progress' }: ProgressBarProps): React.JSX.Element {
  const clamped = ratio === null ? null : Math.min(1, Math.max(0, ratio));
  // The fill width is data, so it is passed as a custom property and drawn by the stylesheet.
  const style = clamped === null ? undefined : ({ '--settings-progress': String(clamped) } as CSSProperties);
  return (
    <div className={`bn-settings-progress${clamped === null ? ' bn-settings-progress--indeterminate' : ''}`} role={ROLES[kind]}
      aria-label={label} aria-valuemin={0} aria-valuemax={PERCENT} aria-valuenow={clamped === null ? undefined : Math.round(clamped * PERCENT)}
      aria-valuetext={valueText} style={style}>
      <span className="bn-settings-progress__fill" />
    </div>
  );
}
