import { useId, useRef, useState, type ReactNode } from 'react';
import { formatBytes, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import type { ModelStatus } from '../offline/useModel';
import { useOnline } from '../offline/useQueueStatus';
import './ModelNotice.css';

export interface ModelNoticeProps {
  readonly model: ModelStatus;
  /** A session is running: the model is in use, so the download confirmation is no longer relevant. */
  readonly active: boolean;
}

/**
 * The model requirement before the first session: its size and a download button, the progress while it
 * downloads (also when Welcome or Settings started it), and what to do when it fails. Once the model is usable
 * only a download started here is confirmed, until the first session starts.
 */
export function ModelNotice({ model, active }: ModelNoticeProps): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const t = dict.listen.model;
  const online = useOnline();
  const progressId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  // Set when the download starts here, so the screen confirms it finished instead of going silent.
  const [requested, setRequested] = useState(false);
  // The confirmation has done its job once a session starts; without this it would come back after stopping.
  if (requested && active) setRequested(false);

  // The pressed button is replaced by the progress bar: focus moves to the region first so it is not lost.
  const run = (operation: () => Promise<void>): void => {
    setRequested(true);
    regionRef.current?.focus();
    void operation();
  };

  let content: ReactNode = null;
  if (model.state === 'missing') {
    // The name and size come from the published manifest, so they follow the model actually served.
    const { available } = model;
    content = (
      <Notice tone="info" icon="download" title={t.missingTitle}
        action={online ? <Button icon="download" onClick={() => { run(model.download); }}>{t.download}</Button> : undefined}>
        <p>{available ? t.missingText(available.model_id, formatBytes(available.size_bytes, locale)) : t.missingTextNoSize}</p>
        {!online && <p>{t.offline}</p>}
      </Notice>
    );
  } else if (model.state === 'downloading') {
    const { received, total } = model.progress;
    content = (
      <div className="bn-listen-model__progress">
        <p id={progressId} className="bn-listen-model__title">{t.downloading}</p>
        {/* Without a known total the bar is indeterminate. */}
        <progress className="bn-listen-model__bar" aria-labelledby={progressId} max={total > 0 ? total : undefined} value={total > 0 ? received : undefined} />
        {total > 0 && <p className="bn-listen-model__bytes">{t.progress(formatBytes(received, locale), formatBytes(total, locale))}</p>}
      </div>
    );
  } else if (model.state === 'error') {
    // 'error' means no usable model: with the published one known the download failed and is retried, otherwise
    // the check itself failed. A failed update never lands here, since the installed model keeps working.
    const retry = model.available ? model.download : model.checkForUpdate;
    content = (
      <Notice tone="error" title={t.errorTitle}
        action={<Button variant="quiet" onClick={() => { run(retry); }}>{dict.common.actions.retry}</Button>}>
        <p>{t.errorText}</p>
      </Notice>
    );
  } else if (model.state === 'ready' && requested) {
    content = <Notice tone="success" icon="check" live>{t.ready}</Notice>;
  }

  if (!content) return null;
  return <div ref={regionRef} className="bn-listen-model" tabIndex={-1}>{content}</div>;
}
