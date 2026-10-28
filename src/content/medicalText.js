export function medicalPoints(text) {
  return String(text || '').split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .map(line=>line.replace(/^(?:[•●▪·]\s*|[-*]\s+)/,''));
}
