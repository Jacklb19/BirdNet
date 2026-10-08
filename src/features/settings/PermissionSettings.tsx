import { useId, type Ref } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatMeters, useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Toggle } from '../../shared/ui/Toggle';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import './PermissionSettings.css';

export interface PermissionSettingsProps {
  readonly offline: OfflineSettingsState;
  /** The group takes focus when another screen opens Settings here. */
  readonly ref?: Ref<HTMLDivElement>;
}

/** The two things that may leave the phone, each off until the person turns it on: an approximate place and doubtful audio. */
export function PermissionSettings({ offline, ref }: PermissionSettingsProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.permissions;
  const uid = useId();
  const ids = { location: `${uid}-location`, locationDetail: `${uid}-location-detail`, audio: `${uid}-audio`, audioDetail: `${uid}-audio-detail` };
  const { settings, update } = offline;
  const distance = formatMeters(APPROX_CELL_METERS, locale);

  return (
    <div ref={ref} tabIndex={-1} className="bn-settings-permissions">
      <ListGroup title={texts.title}>
        <ListRow labelId={ids.location} descriptionId={ids.locationDetail} label={texts.location} description={texts.locationDetail(distance)}
          trailing={<Toggle labelledBy={ids.location} describedBy={ids.locationDetail} checked={settings?.locationEnabled ?? false} disabled={!settings}
            onChange={(checked) => { void update({ locationEnabled: checked }); }} />} />
        <ListRow labelId={ids.audio} descriptionId={ids.audioDetail} label={texts.audio} description={texts.audioDetail}
          trailing={<Toggle labelledBy={ids.audio} describedBy={ids.audioDetail} checked={settings?.audioConsent ?? false} disabled={!settings}
            onChange={(checked) => { void update({ audioConsent: checked }); }} />} />
      </ListGroup>
    </div>
  );
}
