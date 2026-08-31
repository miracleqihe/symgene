import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareSocialData } from '../scripts/research/prepare-social-data.mjs';

const writeJsonl = (path, rows) => {
  writeFileSync(path, `${rows.map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n')}\n`);
};

test('social research pipeline: deduplicates, redacts and never creates a reputation score', () => {
  const root = mkdtempSync(join(tmpdir(), 'symgene-social-pipeline-'));
  try {
    const input = join(root, 'input');
    const output = join(root, 'work-output');
    mkdirSync(input);
    const institutions = join(input, 'institutions.json');
    writeFileSync(institutions, JSON.stringify({
      schemaVersion: 1,
      country: { china: { institutions: [{ id: 'example-1', name: '示例市安心医院' }] } }
    }));

    const xhsContents = join(input, 'xhs-contents.jsonl');
    const xhsComments = join(input, 'xhs-comments.jsonl');
    const douyinComments = join(input, 'douyin-comments.jsonl');
    writeJsonl(xhsContents, [
      { note_id: 'n1', title: '我去示例市安心医院看病，挂号方便', last_modify_ts: 1 },
      { note_id: 'n1', title: '我去示例市安心医院看病，医生很耐心', last_modify_ts: 2 },
      { note_id: 'n2', title: '我在示例市安心医院看病时曾有自伤想法', last_modify_ts: 2 },
      { note_id: 'n3', title: '我去示例市安心医院看病，我的医生叫张小安，后来做了MECT', last_modify_ts: 2 }
    ]);
    writeJsonl(xhsComments, [
      { comment_id: 'c1', note_id: 'n1', content: '我在示例市安心医院复诊，电话 13800138000', create_time: 3 },
      { comment_id: 'c2', note_id: 'n2', content: '我去复诊，挂号流程很方便', create_time: 3 },
      '{"comment_id":'
    ]);
    writeJsonl(douyinComments, [
      { comment_id: 'd1', aweme_id: 'a1', content: '我到示例市安心医院排队很久', create_time: 4 },
      { comment_id: 'd2', aweme_id: 'a1', content: '我在示例市安心医院复诊时曾有自伤想法', create_time: 5 },
      { comment_id: 'd3', aweme_id: 'a1', content: '关于两岸话题，不评价示例市安心医院', create_time: 6 }
    ]);

    const summary = prepareSocialData({
      sources: [
        { platform: 'xhs', kind: 'contents', filePath: xhsContents },
        { platform: 'xhs', kind: 'comments', filePath: xhsComments },
        { platform: 'douyin', kind: 'comments', filePath: douyinComments }
      ],
      institutionsPath: institutions,
      outputDir: output
    });

    assert.equal(summary.publicationStatus, 'LOCAL_RESEARCH_ONLY');
    assert.equal(summary.totals.uniqueRecords, 8);
    assert.equal(summary.totals.quarantineRecords, 1);
    assert.equal(summary.sources[0].duplicateRows, 1);
    assert.equal(summary.flagCounts.direct_identifier_redacted, 2);
    assert.equal(summary.flagCounts.high_risk_personal_disclosure, 2);
    assert.equal(summary.flagCounts.public_affairs_or_identity_sensitive, 1);
    assert.equal(summary.flagCounts.context_requires_restricted_review, 1);
    assert.equal(summary.flagCounts.named_clinician_or_staff, 1);
    assert.equal(summary.flagCounts.medical_treatment_detail, 1);

    const privateText = readFileSync(join(output, 'normalized-private.jsonl'), 'utf8');
    const aggregateText = readFileSync(join(output, 'aggregate-research.json'), 'utf8');
    assert.doesNotMatch(privateText, /13800138000|张小安|\"note_id\"|\"comment_id\"|sourceKeyword|source_keyword|nickname|user_id/);
    assert.match(privateText, /\[PHONE\]/);
    assert.match(privateText, /\[CLINICIAN\]/);
    assert.match(privateText, /医生很耐心/);
    assert.doesNotMatch(aggregateText, /cleanedText|reputationScore|notesList|https?:\/\//);
    assert.equal(summary.institutions[0].candidateExperienceRecords, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
