import { useSyncExternalStore } from 'react';
import { IMPORT_ACTIVITY_EVENT } from './import.config';

let active = false;
export const importIsActive = (): boolean => active;
export function setImportActive(value: boolean): void { active = value; window.dispatchEvent(new Event(IMPORT_ACTIVITY_EVENT)); }
function subscribe(changed: () => void): () => void {
  window.addEventListener(IMPORT_ACTIVITY_EVENT, changed);
  return () => { window.removeEventListener(IMPORT_ACTIVITY_EVENT, changed); };
}
export const useImportActive = (): boolean => useSyncExternalStore(subscribe, importIsActive);
