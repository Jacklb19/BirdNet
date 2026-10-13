import { useId, type Ref } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatMeters, useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Toggle } from '../../shared/ui/Toggle';
import { useSharing } from '../account/useSharing';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import './PermissionSettings.css';

export interface PermissionSettingsProps {
  readonly offline: OfflineSettingsState;
  /** The group takes focus when another screen opens Settings here. */
  readonly ref?: Ref<HTMLDivElement>;
}

/** What may leave the phone, each off until the person turns it on: a rounded place and sharing on everyone's map. */
export function PermissionSettings({ offline, ref }: PermissionSettingsProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.permissions;
  const uid = useId();
  const ids = { location: `${uid}-location`, locationDetail: `${uid}-location-detail`, share: `${uid}-share`, shareDetail: `${uid}-share-detail` };
  const sharing = useSharing();
  const { settings, update } = offline;
  const distance = formatMeters(APPROX_CELL_METERS, locale);

  return (
    <div ref={ref} tabIndex={-1} className="bn-settings-permissions">
      <ListGroup title={texts.title}>
        <ListRow labelId={ids.location} descriptionId={ids.locationDetail} label={texts.location} description={texts.locationDetail(distance)}
          trailing={<Toggle labelledBy={ids.location} describedBy={ids.locationDetail} checked={settings?.locationEnabled ?? false} disabled={!settings}
            onChange={(checked) => { void update({ locationEnabled: checked }); }} />} />
        <ListRow labelId={ids.share} descriptionId={ids.shareDetail} label={texts.share} description={texts.shareDetail(distance)}
          trailing={<Toggle labelledBy={ids.share} describedBy={ids.shareDetail} checked={sharing.choice === true} disabled={!sharing.ready || sharing.working}
            onChange={(checked) => { void sharing.choose(checked); }} />} />
      </ListGroup>
      {sharing.pendingUpload && <Notice tone="caution" icon="pending" live>{texts.sharePending}</Notice>}
    </div>
  );
}
