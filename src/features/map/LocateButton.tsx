import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import './LocateButton.css';

export interface LocateButtonProps {
  readonly busy: boolean;
  readonly onLocate: () => void;
}

/**
 * Button under the zoom buttons that centres the map on the person's approximate cell. It says so in a word beside
 * the crosshair (ADR-47), and the whole sentence stays as its accessible name and tooltip.
 */
export function LocateButton({ busy, onLocate }: LocateButtonProps): React.JSX.Element {
  const { dict } = useI18n();
  const label = dict.map.controls.locate;
  return (
    <button type="button" className="bn-map-locate" aria-label={label} title={label} aria-busy={busy}
      onClick={() => { if (!busy) onLocate(); }}>
      <Icon name="locate" size="s" />
      <span aria-hidden="true">{dict.map.controls.locateShort}</span>
    </button>
  );
}
