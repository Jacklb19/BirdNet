import { formatBytes, formatNumber, formatPercent, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { ListGroup } from '../../shared/ui/ListGroup';
import {
  DEFAULT_DETECTION_STYLE, DETECTION_MODELS, DETECTION_STYLES, modelInUse, type DetectionModel,
} from '../inference/detectionChoices';
import { alternateBytes } from '../inference/modelManifest';
import { useAlternateModel } from '../offline/useAlternateModel';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { ChoiceGroup } from './ChoiceGroup';
import { ProgressBar } from './ProgressBar';
import { DOWNLOAD_PERCENT_DIGITS } from './settings.config';
import './ModelSettings.css';

const NEEDS_SECOND_MODEL: readonly DetectionModel[] = ['preview', 'combined'];

/**
 * How the app detects (ADR-31): which model listens, the newer model a person may add to compare, and whether a
 * doubtful call has to be heard twice. Every choice takes effect the next time listening starts.
 */
export function DetectionSettings({ offline }: { readonly offline: OfflineSettingsState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.detection;
  const second = useAlternateModel();
  const online = useOnline();
  const { settings, update } = offline;
  const { installed, available, progress } = second;
  const ratio = progress.total > 0 ? progress.received / progress.total : null;
  const downloaded = formatBytes(progress.received, locale);
  const total = formatBytes(progress.total, locale);

  const status = ((): string => {
    switch (second.state) {
      case 'checking': return texts.second.checking;
      case 'unmanaged': return available ? texts.second.unmanaged : texts.second.unavailable;
      case 'unavailable': return texts.second.unavailable;
      case 'absent': return available ? texts.second.absent(formatBytes(alternateBytes(available), locale)) : texts.second.unavailable;
      case 'downloading': return texts.second.downloading;
      case 'ready': return installed ? texts.second.ready(formatNumber(installed.num_classes, locale), formatBytes(alternateBytes(installed), locale)) : texts.second.checking;
    }
  })();
  // A different content hash is a different model, whatever its name says.
  const outdated = second.state === 'ready' && installed && available && available.sha256 !== installed.sha256;
  const canDownload = second.state === 'absent' || outdated;
  const message = second.state === 'downloading' ? (second.background ? texts.second.inBackground : texts.second.resumes)
    : second.failed ? texts.second.failed : canDownload && !online ? texts.second.needsConnection : !second.usable ? texts.needsSecond : texts.appliesNext;

  return (
    <>
      <ChoiceGroup title={texts.modelTitle} value={modelInUse(settings?.detectionModel, second.usable)}
        onChange={(value) => { void update({ detectionModel: value }); }}
        options={DETECTION_MODELS.map((value) => ({
          value, label: texts.models[value].label, detail: texts.models[value].detail,
          disabled: !settings || (NEEDS_SECOND_MODEL.includes(value) && !second.usable),
        }))} />

      <ListGroup title={texts.second.title}>
        <div className="bn-settings-model">
          <span className={second.usable ? 'bn-settings-model__badge bn-settings-model__badge--ready' : 'bn-settings-model__badge'}>
            <Icon name={second.usable ? 'check' : 'download'} size="s" />
          </span>
          <div className="bn-settings-model__text">
            <p className="bn-settings-model__title">{texts.second.name}</p>
            <p className="bn-settings-model__detail">{status}</p>
            {second.state === 'downloading' && (
              <div className="bn-settings-model__progress">
                <ProgressBar ratio={ratio} label={texts.second.progressLabel}
                  valueText={ratio === null ? undefined : dict.settings.model.downloadProgress(downloaded, total)} />
                {ratio !== null && (
                  <p className="bn-settings-model__detail">
                    {dict.settings.model.downloadProgress(downloaded, total)}{dict.common.separator}{formatPercent(ratio, locale, DOWNLOAD_PERCENT_DIGITS)}
                  </p>
                )}
              </div>
            )}
            <p className="bn-settings-model__detail" aria-hidden="true">{message}</p>
            {/* Always in the tree, so the outcome of a download is announced when it appears. */}
            <p className="visually-hidden" role="status">{message}</p>
          </div>
        </div>
        {canDownload && (
          <button type="button" className="bn-settings-model__action" disabled={!online} onClick={() => { void second.download(texts.second.progressLabel); }}>
            {outdated ? texts.second.update : texts.second.download}
          </button>
        )}
        {second.state === 'ready' && (
          <button type="button" className="bn-settings-model__action" onClick={() => { void second.remove(); }}>
            {texts.second.remove}
          </button>
        )}
      </ListGroup>

      <ChoiceGroup title={texts.styleTitle} value={settings?.detectionStyle ?? DEFAULT_DETECTION_STYLE}
        onChange={(value) => { void update({ detectionStyle: value }); }}
        options={DETECTION_STYLES.map((value) => ({ value, label: texts.styles[value].label, detail: texts.styles[value].detail, disabled: !settings }))} />
    </>
  );
}
