import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

// Inspect every component below the supplied checkout, before realpath can
// erase a symlink. Ordinary OS aliases above the checkout are not data inputs.
export function requireLocalPath(root, relative, code = 'CONFIG_UNSAFE_PATH') {
  if (typeof relative !== 'string' || isAbsolute(relative) || relative.includes('\\')
    || relative.split('/').some((part) => !part || part === '.' || part === '..')) fail(code);
  let current = resolve(root);
  const anchor = lstatSync(current);
  if (!anchor.isDirectory() || anchor.isSymbolicLink()) fail(code);
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) fail(code);
  }
  return current;
}

// This is only a bounded JSON reader for local lock/provenance descriptors.
// Domain fields and content validation remain owned by the pipeline schema.
export function readLocalConfig(root, relative, code = 'CONFIG_UNSAFE_PATH') {
  const file = requireLocalPath(root, relative, code);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) fail('CONFIG_FILE_INVALID');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)); }
  catch { fail('CONFIG_UTF8_INVALID'); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('CONFIG_JSON_INVALID'); }
  let offset = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === '\\') offset++;
      else if (character === '"') return JSON.parse(text.slice(start, offset));
    }
    fail('CONFIG_JSON_INVALID');
  };
  function value(depth) {
    if (depth > 64) fail('CONFIG_JSON_TOO_DEEP');
    whitespace();
    const first = text[offset++];
    if (first === '{') {
      const seen = new Set();
      whitespace();
      if (text[offset] === '}') { offset++; return; }
      while (offset < text.length) {
        whitespace();
        const name = string();
        if (seen.has(name)) fail('CONFIG_DUPLICATE_JSON_KEY');
        seen.add(name);
        whitespace();
        offset++; // JSON.parse above has already checked the colon and syntax.
        value(depth + 1);
        whitespace();
        if (text[offset++] === '}') return;
      }
    } else if (first === '[') {
      whitespace();
      if (text[offset] === ']') { offset++; return; }
      while (offset < text.length) {
        value(depth + 1);
        whitespace();
        if (text[offset++] === ']') return;
      }
    } else if (first === '"') { offset--; string(); }
    else while (offset < text.length && !/[\t\n\r ,\]}]/.test(text[offset])) offset++;
  }
  value(0);
  whitespace();
  if (offset !== text.length) fail('CONFIG_JSON_INVALID');
  return parsed;
}
