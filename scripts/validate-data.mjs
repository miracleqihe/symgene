import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneSeed } from '../src/data.js';

const COLLECTIONS = ['drugs', 'disorders', 'cases', 'resources'];
const LOCAL_ABSOLUTE_PATH_PATTERN = /(?:\/Users\/[^/\\]+(?:[\\/]|$)|\/home\/[^/\\]+(?:[\\/]|$)|\b[A-Za-z]:[\\/]|(?:^|[\s"'(])\\\\[^\\/\s]+\\[^\\/\s]+)/i;
const PRIVATE_DIRECTORY_PATTERN = /(?:^|[\\/])(?:raw|work|tmp)(?:[\\/]|$)/i;
const FILE_URL_PATTERN = /\bfile:\/\//i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function addError(errors, type, id, field, message) {
  errors.push({ type, id, field, message });
}

function visitStrings(value, field, visit, seen = new Set()) {
  if (typeof value === 'string') {
    visit(value, field);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, `${field}[${index}]`, visit, seen));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    visitStrings(item, field ? `${field}.${key}` : key, visit, seen);
  });
}

function validateRequiredStrings(errors, type, item, id, fields) {
  fields.forEach((field) => {
    if (!isNonEmptyString(item[field])) {
      addError(errors, type, id, field, '必须是非空字符串');
    }
  });
}

function validateResourceUrl(errors, item, id) {
  if (typeof item.url !== 'string') {
    addError(errors, 'resources', id, 'url', '必须是字符串');
    return;
  }

  const url = item.url.trim();
  if (!url) {
    addError(errors, 'resources', id, 'url', '必须是非空字符串');
    return;
  }
  if (PRIVATE_DIRECTORY_PATTERN.test(url)) {
    addError(errors, 'resources', id, 'url', '不得指向 raw/、work/ 或 tmp/ 私有目录');
    return;
  }
  if (FILE_URL_PATTERN.test(url)) {
    addError(errors, 'resources', id, 'url', '不得使用 file:// URL');
    return;
  }
  if (LOCAL_ABSOLUTE_PATH_PATTERN.test(url)) {
    addError(errors, 'resources', id, 'url', '不得使用本地绝对路径或 UNC 网络路径');
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    addError(errors, 'resources', id, 'url', '必须是有效的 http: 或 https: URL');
    return;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    addError(errors, 'resources', id, 'url', '只允许 http: 或 https: URL');
    return;
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    addError(errors, 'resources', id, 'url', `不得指向本地主机：${parsed.hostname}`);
  }
}

export function validateData(data) {
  const errors = [];
  const collections = {};

  COLLECTIONS.forEach((type) => {
    if (!Array.isArray(data?.[type])) {
      addError(errors, type, '(collection)', type, `data.${type} 必须是数组`);
      collections[type] = [];
      return;
    }
    collections[type] = data[type];
  });

  COLLECTIONS.forEach((type) => {
    const idOwners = new Map();
    collections[type].forEach((item, index) => {
      const fallbackId = `#${index}`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        addError(errors, type, fallbackId, '(entry)', `${type}[${index}] 条目必须是对象`);
        return;
      }

      const id = isNonEmptyString(item.id) ? item.id.trim() : fallbackId;
      if (!isNonEmptyString(item.id)) {
        addError(errors, type, id, 'id', `${type}[${index}].id 必须是非空字符串`);
      } else if (idOwners.has(id)) {
        addError(errors, type, id, 'id', `${type}[${index}].id 与同类型 ${type}[${idOwners.get(id)}] 重复`);
      } else {
        idOwners.set(id, index);
      }

      visitStrings(item, '', (value, field) => {
        if (type === 'resources' && field === 'url') return;
        if (LOCAL_ABSOLUTE_PATH_PATTERN.test(value) || FILE_URL_PATTERN.test(value)) {
          addError(errors, type, id, field, '包含本地绝对路径、UNC 网络路径或 file:// URL');
        }
      });
    });
  });

  collections.drugs.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    validateRequiredStrings(errors, 'drugs', item, id, ['name', 'source']);
    if (!isNonEmptyString(item.className) && !isNonEmptyString(item.categoryLabel)) {
      addError(errors, 'drugs', id, 'className/categoryLabel', '至少一个字段必须是非空字符串');
    }
  });

  collections.disorders.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    validateRequiredStrings(errors, 'disorders', item, id, ['name', 'category', 'summary', 'source']);
    if (item.relatedDrugIds != null && !Array.isArray(item.relatedDrugIds)) {
      addError(errors, 'disorders', id, 'relatedDrugIds', '必须是数组');
    }
  });

  collections.cases.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    validateRequiredStrings(errors, 'cases', item, id, ['disorderId', 'title', 'summary', 'source']);
  });

  collections.resources.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    validateRequiredStrings(errors, 'resources', item, id, ['title']);
    validateResourceUrl(errors, item, id);
  });

  const disorderIds = new Set(collections.disorders
    .filter((item) => item && isNonEmptyString(item.id))
    .map((item) => item.id.trim()));
  const drugIds = new Set(collections.drugs
    .filter((item) => item && isNonEmptyString(item.id))
    .map((item) => item.id.trim()));

  collections.cases.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    if (isNonEmptyString(item.disorderId) && !disorderIds.has(item.disorderId.trim())) {
      addError(errors, 'cases', id, 'disorderId', `引用了不存在的疾病 ID：${item.disorderId}`);
    }
  });

  collections.disorders.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.relatedDrugIds == null) return;
    const id = isNonEmptyString(item.id) ? item.id.trim() : `#${index}`;
    if (!Array.isArray(item.relatedDrugIds)) return;
    item.relatedDrugIds.forEach((drugId, drugIndex) => {
      const field = `relatedDrugIds[${drugIndex}]`;
      if (!isNonEmptyString(drugId)) {
        addError(errors, 'disorders', id, field, '关联药物 ID 必须是非空字符串');
      } else if (!drugIds.has(drugId.trim())) {
        addError(errors, 'disorders', id, field, `引用了不存在的药物 ID：${drugId}`);
      }
    });
  });

  return errors;
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

  output.log(`Data validation passed: ${COLLECTIONS
    .map((type) => `${data[type].length} ${type}`)
    .join(', ')}.`);
  return 0;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  process.exitCode = reportValidation(cloneSeed());
}
