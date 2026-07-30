import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneSeed } from '../src/data.js';
import { validateData } from '../src/validation/dataValidation.js';

export function checkLinks(data) {
  const errors = [];
  if (!Array.isArray(data?.resources)) {
    return {
      errors: [{ id: '(collection)', field: 'resources', message: '资源必须是数组' }],
      checked: 0
    };
  }

  const validationErrors = validateData(data)
    .filter((error) => error.type === 'resources' && error.field === 'url')
    .map(({ id, field, message }) => ({ id, field, message }));
  errors.push(...validationErrors);

  const urlOwners = new Map();
  data.resources.forEach((resource, index) => {
    const id = typeof resource?.id === 'string' && resource.id.trim()
      ? resource.id.trim()
      : `#${index}`;
    if (typeof resource?.url !== 'string' || !resource.url.trim()) return;
    let normalized;
    try {
      normalized = new URL(resource.url.trim()).href;
    } catch {
      return;
    }
    if (urlOwners.has(normalized)) {
      errors.push({
        id,
        field: 'url',
        message: `与资源 ${urlOwners.get(normalized)} 使用了重复 URL`
      });
    } else {
      urlOwners.set(normalized, id);
    }
  });

  return { errors, checked: data.resources.length };
}

export function reportLinkCheck(data, output = console) {
  const result = checkLinks(data);
  if (result.errors.length) {
    output.error(`Static link validation failed (${result.errors.length} errors):`);
    result.errors.forEach(({ id, field, message }) => {
      output.error(`- resources[${id}].${field}: ${message}`);
    });
    return 1;
  }
  output.log(`Static link validation passed: ${result.checked} unique public HTTP/HTTPS URLs.`);
  return 0;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  process.exitCode = reportLinkCheck(cloneSeed());
}
