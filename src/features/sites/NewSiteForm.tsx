import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { APPROX_CELL_METERS, FIELD_LIMITS } from '../../config/contract';
import { formatMeters, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import type { ApproximateLocation, CachedSite } from '../offline/types';
import { locateSite, type LocationFailure } from './locateSite';
import './NewSiteForm.css';

export interface NewSiteFormProps {
  readonly id: string;
  readonly onCreate: (name: string, location: ApproximateLocation) => Promise<CachedSite | null>;
  readonly onCreated: (site: CachedSite) => void;
  readonly onCancel: () => void;
}

/** Name and approximate location of a new site; the position is reduced to its cell before it reaches this form. */
export function NewSiteForm({ id, onCreate, onCreated, onCancel }: NewSiteFormProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState<ApproximateLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationFailure, setLocationFailure] = useState<LocationFailure | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const cell = formatMeters(APPROX_CELL_METERS, locale);
  const nameMissing = submitted && !name.trim();
  const ids = {
    title: `${uid}-title`, name: `${uid}-name`, hint: `${uid}-hint`, nameError: `${uid}-name-error`, privacy: `${uid}-privacy`, locate: `${uid}-locate`,
  };

  // The form opens on request, so focus goes straight to its first field.
  useEffect(() => { nameRef.current?.focus(); }, []);

  const locate = async (): Promise<void> => {
    if (locating || saving) return;
    setLocating(true);
    setLocationFailure(null);
    // A new attempt replaces the previous cell: if it fails, the message must not sit behind an older "ready".
    setLocation(null);
    const result = await locateSite();
    setLocating(false);
    if (result.ok) setLocation(result.location);
    else setLocationFailure(result.failure);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    if (!name.trim()) { nameRef.current?.focus(); return; }
    if (!location) { document.getElementById(ids.locate)?.focus(); return; }
    setSaving(true);
    setFailed(false);
    const site = await onCreate(name.trim(), location);
    setSaving(false);
    if (site) onCreated(site);
    else setFailed(true);
  };

  const locationStatus = location
    ? t.locationReady(cell)
    : locationFailure ? t.locationErrors[locationFailure] : submitted ? t.locationRequired : '';

  return (
    <form id={id} className="bn-new-site" aria-labelledby={ids.title} noValidate onSubmit={(event) => { void submit(event); }}>
      <h2 id={ids.title} className="bn-new-site__title">{t.newSiteTitle}</h2>
      <div className="bn-new-site__field">
        <label htmlFor={ids.name} className="bn-new-site__label">{t.nameLabel}</label>
        <input ref={nameRef} id={ids.name} className="bn-new-site__input" type="text" required autoComplete="off"
          maxLength={FIELD_LIMITS.siteName} value={name} onChange={(event) => { setName(event.target.value); }}
          aria-invalid={nameMissing} aria-describedby={nameMissing ? `${ids.hint} ${ids.nameError}` : ids.hint} />
        <p id={ids.hint} className="bn-new-site__hint">{t.nameHint(formatNumber(FIELD_LIMITS.siteName, locale))}</p>
        {nameMissing && <p id={ids.nameError} className="bn-new-site__error">{t.nameRequired}</p>}
      </div>
      <fieldset className="bn-new-site__field bn-new-site__location">
        <legend className="bn-new-site__label">{t.locationLabel}</legend>
        {/* aria-disabled keeps keyboard focus on the buttons while they wait; `disabled` would drop it to the page. */}
        <Button id={ids.locate} variant="secondary" icon="locate" aria-disabled={locating || saving} aria-describedby={ids.privacy}
          onClick={() => { void locate(); }}>
          {locating ? t.locating : location ? t.relocate : t.locate}
        </Button>
        <p id={ids.privacy} className="bn-new-site__hint">{t.locationPrivacy(cell)}</p>
        <p role="status" className={location ? 'bn-new-site__ready' : 'bn-new-site__error'}>{locationStatus}</p>
      </fieldset>
      {failed && <Notice tone="error">{t.createError}</Notice>}
      <div className="bn-new-site__actions">
        <Button type="submit" aria-disabled={saving}>{saving ? t.creating : t.create}</Button>
        <Button variant="quiet" disabled={saving} onClick={onCancel}>{dict.common.actions.cancel}</Button>
      </div>
    </form>
  );
}
