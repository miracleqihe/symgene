import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentStyles = readFileSync(
  new URL('../src/styles/components.css', import.meta.url),
  'utf8'
);

test('critical 风险等级使用与 JSX 一致的危险态 CSS selector', () => {
  assert.match(componentStyles, /\.risk-banner\.critical\s*\{/);
  assert.doesNotMatch(componentStyles, /\.risk-banner\.high\s*\{/);
});
