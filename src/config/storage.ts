/** Browser storage keys. Changing one forgets what people saved under the old key. */
export const STORAGE_KEYS = Object.freeze({
  /** JSON object with interface preferences (theme, language, first-run flag). */
  preferences: 'birdnet_settings',
  /** Prefix for cached species photo lookups, one entry per scientific name. */
  photoPrefix: 'birdnet:photo:',
});

export interface StoredPreferences {
  readonly theme?: unknown;
  readonly locale?: unknown;
  readonly welcomed?: unknown;
}

/** Values are `unknown` on purpose: whatever was stored is validated by its owner before use. */
export function readPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.preferences);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Private browsing or a corrupted entry: start from defaults.
    return {};
  }
}

/** Merges one preference; storage failures keep the in-memory value, which is all a session needs. */
export function writePreference(key: keyof StoredPreferences, value: string | boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...readPreferences(), [key]: value }));
  } catch {
    // Quota exceeded or storage disabled; the choice still applies until the page is closed.
  }
}
