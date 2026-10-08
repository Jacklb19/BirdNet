import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import './LocateButton.css';

export interface LocateButtonProps {
  readonly busy: boolean;
  readonly onLocate: () => void;
}

/** Round crosshair button under the zoom buttons; it centres the map on the person's approximate cell. */
export function LocateButton({ busy, onLocate }: LocateButtonProps): React.JSX.Element {
  const { dict } = useI18n();
  const label = dict.map.controls.locate;
  return (
    <button type="button" className="bn-map-locate" aria-label={label} title={label} aria-busy={busy}
      onClick={() => { if (!busy) onLocate(); }}>
      <Icon name="locate" />
    </button>
  );
}
