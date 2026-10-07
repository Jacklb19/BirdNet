import { formatBytes, formatNumber, formatPercent, useI18n } from '../../i18n';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { ListGroup } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import type { ModelManifest } from '../inference/inference.types';
import { useOnline } from '../offline/useQueueStatus';
import { useModel } from '../offline/useModel';
import { ProgressBar } from './ProgressBar';
import { DOWNLOAD_PERCENT_DIGITS } from './settings.config';
import './ModelSettings.css';

interface ModelAction {
  readonly label: string;
  readonly run: () => void;
  /** Cannot run now (offline); the message below says why. */
  readonly disabled?: boolean;
  /** Running now: the button ignores clicks but keeps the keyboard focus, which `disabled` would drop. */
  readonly busy?: boolean;
}

interface ModelView {
  readonly icon: IconName;
  readonly tone: 'ready' | 'neutral' | 'error';
  readonly title: string;
  readonly detail: string | null;
  readonly action: ModelAction | null;
}

/** Whether the identification model is on the phone, and the one action that moves it forward. */
export function ModelSettings(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.model;
  // Shared with Welcome and Listen: a download started there shows its progress here, and is never started twice.
  const model = useModel();
  const online = useOnline();
  const { installed, available, progress, updateCheck } = model;
  const checking = updateCheck === 'checking';

  const size = (manifest: ModelManifest): string => formatBytes(manifest.size_bytes, locale);
  const download = (): void => { void model.download(); };
  const runCheck = (): void => { void model.checkForUpdate(); };
  // A different content hash is a different model, whatever its name says.
  const update = model.state === 'ready' && installed && available && available.sha256 !== installed.sha256 ? available : null;

  const view = ((): ModelView => {
    switch (model.state) {
      case 'checking':
        return { icon: 'download', tone: 'neutral', title: texts.checking, detail: null, action: null };
      case 'unmanaged':
        return { icon: 'listen', tone: 'neutral', title: texts.unmanaged, detail: texts.unmanagedDetail, action: null };
      case 'missing':
        return { icon: 'download', tone: 'neutral', title: texts.missing, detail: available ? texts.missingDetail(size(available)) : null, action: { label: texts.download, run: download, disabled: !online } };
      case 'downloading':
        return { icon: 'download', tone: 'neutral', title: texts.downloading, detail: null, action: null };
      case 'error':
        // Without a known manifest the failure was the check itself, so checking again is the retry.
        return { icon: 'pending', tone: 'error', title: texts.error, detail: texts.errorDetail, action: { label: dict.common.actions.retry, run: available ? download : runCheck } };
      case 'ready':
        return {
          icon: 'check', tone: 'ready', title: texts.ready,
          detail: installed ? texts.summary(installed.model_id, formatNumber(installed.num_classes, locale), size(installed)) : null,
          action: update
            ? { label: texts.update, run: download, disabled: !online }
            : { label: checking ? texts.checkingUpdate : texts.checkUpdate, run: runCheck, disabled: !online, busy: checking },
        };
    }
  })();

  // Offline, the disabled action needs a reason next to it; otherwise the outcome of the last check the person asked
  // for. "Up to date" is said only when the published model was actually compared, never after a failed check.
  const message = update ? (model.updateFailed ? texts.updateFailed(update.model_id) : texts.updateAvailable(update.model_id, size(update)))
    : model.state === 'missing' && !online ? texts.downloadNeedsConnection
    : model.state === 'ready' && !online ? texts.checkNeedsConnection
    : model.state === 'ready' && updateCheck === 'current' ? texts.upToDate
    : model.state === 'ready' && updateCheck === 'failed' ? texts.checkFailed
    : null;
  const ratio = progress.total > 0 ? progress.received / progress.total : null;
  const { action } = view;

  return (
    <>
      <ListGroup title={texts.title}>
        <div className="bn-settings-model">
          <span className={`bn-settings-model__badge bn-settings-model__badge--${view.tone}`}><Icon name={view.icon} size="s" /></span>
          <div className="bn-settings-model__text">
            <p className="bn-settings-model__title">{view.title}</p>
            {view.detail && <p className="bn-settings-model__detail">{view.detail}</p>}
            {model.state === 'downloading' && (
              <div className="bn-settings-model__progress">
                <ProgressBar ratio={ratio} label={texts.progressLabel}
                  valueText={ratio === null ? undefined : texts.downloadProgress(formatBytes(progress.received, locale), formatBytes(progress.total, locale))} />
                {ratio !== null && (
                  <p className="bn-settings-model__detail">
                    {texts.downloadProgress(formatBytes(progress.received, locale), formatBytes(progress.total, locale))}{dict.common.separator}{formatPercent(ratio, locale, DOWNLOAD_PERCENT_DIGITS)}
                  </p>
                )}
              </div>
            )}
            {message && <p className="bn-settings-model__detail" aria-hidden="true">{message}</p>}
            {/* Always in the tree, so the outcome of a check or a newly found version is announced when it appears. */}
            <p className="visually-hidden" role="status">{message}</p>
          </div>
        </div>
        {action && (
          <button type="button" className="bn-settings-model__action" disabled={action.disabled}
            aria-disabled={action.busy || undefined} aria-busy={action.busy || undefined} onClick={() => { if (!action.busy) action.run(); }}>
            {action.label}
          </button>
        )}
      </ListGroup>
      {model.evictable && <Notice tone="caution" icon="pending">{texts.evictable}</Notice>}
    </>
  );
}
