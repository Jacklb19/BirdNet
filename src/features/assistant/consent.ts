import { CONSENT_EVENT, CONSENT_PREFIX } from './assistant.config';

export function consentKey(ownerId: string): string { return `${CONSENT_PREFIX}${ownerId}`; }
export function hasAssistantConsent(ownerId: string, version: string, storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    const value: unknown = JSON.parse(storage.getItem(consentKey(ownerId)) ?? 'null');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    return Object.keys(entry).length === 2 && entry.version === version && entry.accepted === true;
  } catch { return false; }
}
export function saveAssistantConsent(ownerId: string, version: string): boolean {
  try {
    localStorage.setItem(consentKey(ownerId), JSON.stringify({ version, accepted: true }));
    window.dispatchEvent(new Event(CONSENT_EVENT));
    return true;
  } catch { return false; }
}
/** Called by account deletion too; no question, answer or query result is persisted here. */
export function clearAssistantConsent(ownerId: string): void {
  try { localStorage.removeItem(consentKey(ownerId)); } catch { /* In-memory revocation still applies. */ }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
