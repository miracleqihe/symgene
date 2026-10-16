import { BACKUP_KEY_PREFIX, STORAGE_KEY } from '../storage/constants.js';

export const DEVELOPMENT_STORAGE_PREFIX = 'symgene-t02-development:';
export const LEDGER_KEY = 't02-synthetic-ledger';
export const SELECTION_KEY = 't02-synthetic-selection';
export const CLOCK_KEY = 't02-synthetic-clock-offset';
const allowed = (key) => typeof key === 'string'
  && (key === STORAGE_KEY || key === LEDGER_KEY || key === SELECTION_KEY || key === CLOCK_KEY || key.startsWith(BACKUP_KEY_PREFIX));

// A namespace view of native Storage, not an in-memory storage implementation.
// Existing storage APIs retain their normal logical keys, migration and backup
// behavior; no operation can address the original application's physical keys.
export function createDevelopmentStorage(nativeStorage) {
  const keys = () => {
    const result = [];
    for (let index = 0; index < nativeStorage.length; index++) {
      const physical = nativeStorage.key(index);
      if (physical?.startsWith(DEVELOPMENT_STORAGE_PREFIX)) {
        const logical = physical.slice(DEVELOPMENT_STORAGE_PREFIX.length);
        if (allowed(logical)) result.push(logical);
      }
    }
    return result;
  };
  const physical = (key) => {
    if (!allowed(key)) throw Object.assign(new Error('Development storage key rejected.'), { code: 'DEV_STORAGE_KEY_REJECTED' });
    return DEVELOPMENT_STORAGE_PREFIX + key;
  };
  return Object.freeze({
    get length() { return keys().length; },
    key(index) { return keys()[index] ?? null; },
    getItem(key) { return nativeStorage.getItem(physical(key)); },
    setItem(key, value) { nativeStorage.setItem(physical(key), String(value)); },
    removeItem(key) { nativeStorage.removeItem(physical(key)); },
    clear() { for (const key of keys()) nativeStorage.removeItem(physical(key)); }
  });
}
