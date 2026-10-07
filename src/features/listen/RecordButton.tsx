import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { formatClock } from '../../shared/time';
import { useElapsed } from '../../shared/useElapsed';
import './RecordButton.css';

export interface RecordButtonProps {
  /** `large`: the round phone control with its label below. `inline`: a compact pill for the desktop header. */
  readonly variant: 'large' | 'inline';
  readonly active: boolean;
  readonly startedAt: number | null;
  /** Why listening cannot start yet (shown as the label); null when it can. Stopping is always possible. */
  readonly blockedReason: string | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/**
 * One control starts and stops the session; while listening it shows the running time. The stop control keeps
 * a fixed name (it starts with the visible verb), because a name that changed every second would be read again
 * and again to someone focused on it; the header's subtitle carries the duration.
 */
export function RecordButton({ variant, active, startedAt, blockedReason, onStart, onStop }: RecordButtonProps): React.JSX.Element {
  const { dict } = useI18n();
  const elapsed = useElapsed(startedAt);
  const t = dict.listen.record;
  const label = active ? t.stop(formatClock(elapsed)) : blockedReason ?? t.start;
  const classes = ['bn-listen-record', `bn-listen-record--${variant}`, active ? 'bn-listen-record--stop' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={!active && blockedReason !== null} onClick={active ? onStop : onStart}
      aria-label={active ? t.stopName : undefined}>
      <span className="bn-listen-record__circle" aria-hidden="true">
        {active ? <span className="bn-listen-record__square" /> : <Icon name="listen" size={variant === 'inline' ? 's' : 'm'} />}
      </span>
      <span className="bn-listen-record__label">{label}</span>
    </button>
  );
}
