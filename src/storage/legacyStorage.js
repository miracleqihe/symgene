import { cloneSeed } from '../data.js';
import { LEGACY_DATA_VERSION, STORAGE_KEY } from './constants.js';

export function sanitizeLegacyData(value) {
  const seed = cloneSeed();
  const next = value || seed;
  const isLegacy = next.meta?.version !== LEGACY_DATA_VERSION;
  const savedDrugs = next.drugs || [];
  const canonicalById = new Map(seed.drugs.map((item) => [item.id, item]));
  const normalizedSavedDrugs = savedDrugs.map((saved) => {
    const canonical = canonicalById.get(saved.id);
    if (!canonical) return saved;
    return {
      ...canonical,
      ...saved,
      className: canonical.className,
      categoryLabel: canonical.categoryLabel,
      section: canonical.section,
      classOrder: canonical.classOrder,
      source: canonical.source,
      updated: canonical.updated
    };
  });
  const mergedDrugs = isLegacy
    ? [...normalizedSavedDrugs, ...seed.drugs.filter((item) => !savedDrugs.some((saved) => saved.id === item.id))]
    : normalizedSavedDrugs;
  const mergedDisorders = isLegacy ? seed.disorders : (next.disorders || seed.disorders);
  const mergedCases = isLegacy ? seed.cases : (next.cases || seed.cases);
  const savedResources = (next.resources || []).filter((item) =>
    !item.localPath && /^https?:\/\//i.test(String(item.url || ''))
  );
  const mergedResources = isLegacy
    ? [...savedResources, ...seed.resources.filter((item) => !savedResources.some((saved) => saved.id === item.id))]
    : savedResources;

  return {
    ...next,
    meta: { ...(next.meta || {}), version: LEGACY_DATA_VERSION },
    drugs: mergedDrugs,
    disorders: mergedDisorders,
    cases: mergedCases,
    resources: mergedResources
  };
}

export function readLegacyData(storage = window.localStorage) {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return sanitizeLegacyData(saved ? JSON.parse(saved) : cloneSeed());
  } catch {
    return sanitizeLegacyData(null);
  }
}
