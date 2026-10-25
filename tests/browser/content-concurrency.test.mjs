import assert from 'node:assert/strict';
import test from 'node:test';
import { probeConsumer } from '../../scripts/t02/consumer-concurrency.mjs';

test('a real Chromium 504 fails even after React mounts and accepts its snapshot', { timeout: 55000 }, async () => {
  const row = await probeConsumer({ kind: 'development', beforeNavigate: async ({ page, origin }) => {
    await page.route('**/node_modules/.vite/deps/fictional-startup.js', route => route.fulfill({ status: 504, body: 'Outdated Optimize Dep' }));
    await page.addInitScript(url => { void fetch(url); }, `${origin}/node_modules/.vite/deps/fictional-startup.js`);
  } });
  assert.equal(row.status, 'FAIL');
  assert.equal(row.http504Count, 1);
  assert.ok(row.timeline.some(event => event.stage === 'react-mount'));
  assert.ok(row.timeline.some(event => event.stage === 'snapshot')), '504 must not be forgiven by later successful UI';
});
