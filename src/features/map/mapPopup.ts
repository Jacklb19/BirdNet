/** Already translated and formatted lines of a point popup. */
export interface PopupLines {
  readonly name: string;
  /** Null when there is no common name and `name` already is the scientific name. */
  readonly scientificName: string | null;
  readonly detail: string;
  readonly recordedAt: string;
  /** ISO timestamp for the `datetime` attribute. */
  readonly recordedAtIso: string;
  /** "Your record · <site>" on the viewer's own detections; null on everyone else's. */
  readonly own: string | null;
  readonly note: string;
  /** Link to the species card. */
  readonly card: { readonly href: string; readonly label: string };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Popup body for one detection. Species names come from other people's records, so the content is built
 * with text nodes only, never parsed as HTML.
 */
export function popupContent(lines: PopupLines): HTMLElement {
  const body = document.createElement('div');
  body.className = 'bn-map-popup';
  const when = element('time', 'bn-map-popup__line', lines.recordedAt);
  when.dateTime = lines.recordedAtIso;
  body.append(element('p', 'bn-map-popup__name', lines.name));
  if (lines.scientificName !== null) body.append(element('p', 'bn-map-popup__scientific scientific', lines.scientificName));
  body.append(element('p', 'bn-map-popup__line', lines.detail), when);
  if (lines.own !== null) body.append(element('p', 'bn-map-popup__own', lines.own));
  body.append(element('p', 'bn-map-popup__note', lines.note));
  const card = element('a', 'bn-map-popup__card', lines.card.label);
  card.href = lines.card.href;
  body.append(card);
  return body;
}
