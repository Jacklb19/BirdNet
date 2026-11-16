import { useId } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import './WalkInvite.css';

/**
 * The third way to listen (ADR-46, ADR-47): a recording made before, analyzed on this phone with the same model.
 * Offered between sessions, beside the walk, since the microphone and a file cannot be analyzed together.
 */
export function ImportInvite(): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.listen.importFile;
  const titleId = useId();
  return (
    <section className="bn-listen-walk bn-listen-walk--file" aria-labelledby={titleId}>
      <span className="bn-listen-walk__icon" aria-hidden="true"><Icon name="download" /></span>
      <div className="bn-listen-walk__body">
        <h2 id={titleId} className="bn-listen-walk__title display">{t.title}</h2>
        <p>{t.text}</p>
        <Button variant="secondary" icon="listen" href={routeHash({ name: 'importAudio' })}>{t.action}</Button>
      </div>
    </section>
  );
}
