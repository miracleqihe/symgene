import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneSeed } from '../src/data.js';
import {
  DATA_COLLECTIONS,
  validateData as validateKnowledgeData
} from '../src/validation/dataValidation.js';

export function validateData(data) {
  return validateKnowledgeData(data, { requireDrugSideEffects: true });
}

export function reportValidation(data, output = console) {
  const errors = validateData(data);
  if (errors.length) {
    output.error(`Data validation failed (${errors.length} errors):`);
    errors.forEach(({ type, id, field, message }) => {
      output.error(`- ${type}[${id}].${field}: ${message}`);
    });
    return 1;
  }

  output.log(`Data validation passed: ${DATA_COLLECTIONS
    .map((type) => `${data[type].length} ${type}`)
    .join(', ')}.`);
  return 0;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  process.exitCode = reportValidation(cloneSeed());
}
