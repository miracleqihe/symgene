import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cloneSeed, seedData } from '../src/data.js';

test('content consolidation preserves every existing medical value and its ordering', () => {
  const seed = cloneSeed();
  assert.deepEqual(Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, value.length])), {
    drugs: 114, disorders: 122, cases: 122, resources: 4,
  });
  assert.equal(createHash('sha256').update(JSON.stringify(seed)).digest('hex'),
    '6e7a8a7ff715bf6191143b536db4567464674fee67a47aed2710776a707de98f');
  seed.drugs[0].name = 'fixture modification';
  assert.notEqual(seedData.drugs[0].name, seed.drugs[0].name);
});
