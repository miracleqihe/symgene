import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATEGORICAL_FIELDS = [
  'entityDecision',
  'experienceDecision',
  'privacyDecision',
  'aggregationDecision'
];

function readLabels(path) {
  const document = JSON.parse(readFileSync(path, 'utf8'));
  if (document?.publicationStatus !== 'LOCAL_LABELS_ONLY'
    || !document.queueId
    || !document.reviewerAlias
    || !Array.isArray(document.annotations)) {
    throw new Error(`${basename(path)} is not a valid LOCAL_LABELS_ONLY document`);
  }
  const annotations = new Map();
  for (const annotation of document.annotations) {
    if (!annotation?.reviewId || annotations.has(annotation.reviewId)) {
      throw new Error(`${basename(path)} contains a missing or duplicate reviewId`);
    }
    annotations.set(annotation.reviewId, annotation);
  }
  return { ...document, annotations };
}

function cohenKappa(pairs) {
  if (pairs.length === 0) return null;
  const leftCounts = new Map();
  const rightCounts = new Map();
  let agreements = 0;
  for (const [left, right] of pairs) {
    if (left === right) agreements += 1;
    leftCounts.set(left, (leftCounts.get(left) ?? 0) + 1);
    rightCounts.set(right, (rightCounts.get(right) ?? 0) + 1);
  }
  const observed = agreements / pairs.length;
  const categories = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let expected = 0;
  for (const category of categories) {
    expected += ((leftCounts.get(category) ?? 0) / pairs.length)
      * ((rightCounts.get(category) ?? 0) / pairs.length);
  }
  return {
    n: pairs.length,
    observedAgreement: Number(observed.toFixed(4)),
    expectedAgreement: Number(expected.toFixed(4)),
    kappa: expected === 1 ? 1 : Number(((observed - expected) / (1 - expected)).toFixed(4))
  };
}

const complete = (annotation) => CATEGORICAL_FIELDS.every((field) => annotation?.[field]);

function aspectAgreement(left, right) {
  const leftSet = new Set(left ?? []);
  const rightSet = new Set(right ?? []);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) return { exact: true, jaccard: 1 };
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  return {
    exact: leftSet.size === rightSet.size && intersection === leftSet.size,
    jaccard: intersection / union.size
  };
}

function decisionCounts(annotations, field) {
  const counts = {};
  for (const annotation of annotations.values()) {
    const value = annotation[field] ?? 'missing';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function analyzeReviewLabels({ labelPaths, outputPath }) {
  if (!Array.isArray(labelPaths) || labelPaths.length !== 2) {
    throw new Error('exactly two independent label files are required');
  }
  const [left, right] = labelPaths.map(readLabels);
  if (left.queueId !== right.queueId) throw new Error('label files belong to different queues');
  if (left.reviewerAlias === right.reviewerAlias) throw new Error('reviewer aliases must be different');

  const overlapIds = [...left.annotations.keys()]
    .filter((id) => right.annotations.has(id))
    .sort();
  const completeOverlapIds = overlapIds.filter((id) => complete(left.annotations.get(id)) && complete(right.annotations.get(id)));
  const agreement = {};
  const disagreements = [];
  for (const field of CATEGORICAL_FIELDS) {
    const pairs = completeOverlapIds.map((id) => [left.annotations.get(id)[field], right.annotations.get(id)[field]]);
    agreement[field] = cohenKappa(pairs);
    for (const id of completeOverlapIds) {
      if (left.annotations.get(id)[field] !== right.annotations.get(id)[field]) {
        disagreements.push({ reviewId: id, field });
      }
    }
  }
  const aspectRows = completeOverlapIds.map((id) => aspectAgreement(
    left.annotations.get(id).aspects,
    right.annotations.get(id).aspects
  ));
  agreement.aspects = aspectRows.length === 0 ? null : {
    n: aspectRows.length,
    exactAgreement: Number((aspectRows.filter((row) => row.exact).length / aspectRows.length).toFixed(4)),
    meanJaccard: Number((aspectRows.reduce((sum, row) => sum + row.jaccard, 0) / aspectRows.length).toFixed(4))
  };

  const report = {
    schemaVersion: 1,
    publicationStatus: 'LOCAL_REVIEW_ANALYSIS_ONLY',
    queueId: left.queueId,
    reviewers: [left.reviewerAlias, right.reviewerAlias],
    coverage: {
      reviewerAnnotations: {
        [left.reviewerAlias]: left.annotations.size,
        [right.reviewerAlias]: right.annotations.size
      },
      overlap: overlapIds.length,
      completeOverlap: completeOverlapIds.length
    },
    agreement,
    decisionCounts: Object.fromEntries([left, right].map((reviewer) => [
      reviewer.reviewerAlias,
      Object.fromEntries(CATEGORICAL_FIELDS.map((field) => [field, decisionCounts(reviewer.annotations, field)]))
    ])),
    disagreements,
    interpretationBoundary: 'Agreement measures labeling consistency, not truth, representativeness, medical quality, or publication approval.'
  };
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseCli(args) {
  const options = { labelPaths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--labels') options.labelPaths.push(resolve(value));
    else if (flag === '--output') options.outputPath = resolve(value);
    else throw new Error(`unknown argument: ${flag}`);
    index += 1;
  }
  if (!options.outputPath) throw new Error('provide --output');
  return options;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const report = analyzeReviewLabels(parseCli(process.argv.slice(2)));
    console.log(JSON.stringify({ queueId: report.queueId, coverage: report.coverage, agreement: report.agreement }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
