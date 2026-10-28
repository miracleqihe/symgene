import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloneSeed } from '../src/data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
export function measureLegacySeed(seed = cloneSeed()) {
  return {
    seedSha256: sha(JSON.stringify(seed)),
    collections: Object.fromEntries(Object.entries(seed).map(([type, rows]) => [type, {
      count: rows.length,
      orderedIdsSha256: sha(JSON.stringify(rows.map(row => row.id))),
      fields: [...new Set(rows.flatMap(Object.keys))].sort(),
      records: rows.map(row => ({ id: row.id, sha256: sha(JSON.stringify(row)), fields: Object.keys(row).sort() }))
    }])),
    referenceSha256: sha(JSON.stringify({
      cases: seed.cases.map(row => [row.id, row.disorderId]),
      disorders: seed.disorders.map(row => [row.id, row.relatedDrugIds ?? null])
    })),
    sortingInputsSha256: sha(JSON.stringify({
      drugs: seed.drugs.map(row => [row.id, row.classOrder ?? null, row.section ?? null, row.categoryLabel ?? null]),
      disorders: seed.disorders.map(row => [row.id, row.category])
    }))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const atlasPaths = execFileSync('git', ['ls-files', 'src/atlas'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const baseline = {
    status: 'legacy_unverified',
    purpose: 'local compatibility fingerprints only; not approval or a republishable content pack',
    sourceCommit,
    method: 'SHA256 UTF8 JSON.stringify; array order retained; no content text exported',
    ...measureLegacySeed(),
    atlasFiles: atlasPaths.map(path => ({ path, sha256: sha(readFileSync(new URL(`../${path}`, import.meta.url))) }))
  };
  writeFileSync(new URL('../docs/t02/golden-baseline.json', import.meta.url), `${JSON.stringify(baseline, null, 2)}\n`);
  const seed = cloneSeed();
  const institutions = JSON.parse(readFileSync(new URL('../src/atlas/institutions.json', import.meta.url), 'utf8')).country.china.institutions;
  const entries = Object.entries({ ...seed, institutions }).flatMap(([collection, rows]) => rows.map((row, order) => ({
    collection, legacyId: row.id, canonicalId: `legacy:${collection}:${sha(JSON.stringify([collection, row.id]))}`,
    order, status: 'legacy_unverified', providerMapping: 'not_inferred_from_legacy_identifier'
  })));
  if (new Set(entries.map(row => JSON.stringify([row.collection, row.legacyId]))).size !== entries.length
    || new Set(entries.map(row => row.canonicalId)).size !== entries.length) throw new Error('LEGACY_ID_MAPPING_CONFLICT');
  writeFileSync(new URL('../docs/t02/legacy-id-map.json', import.meta.url), `${JSON.stringify({
    purpose: 'Reserved permanent application identities for compatibility only; no rights or publication approval implied',
    sourceCommit, seedSha256: baseline.seedSha256,
    rule: 'One-time allocation from exact legacy collection and identifier. Persist this registry; never recompute on rename or provider change.',
    count: entries.length, entries
  }, null, 2)}\n`);
  console.log(JSON.stringify({ sourceCommit, seedSha256: baseline.seedSha256, counts: Object.fromEntries(Object.entries(baseline.collections).map(([k, v]) => [k, v.count])), atlasFiles: atlasPaths.length }));
}
