// Legacy production social-score generator intentionally disabled.
//
// The former implementation could attribute a record to an institution from
// the crawl keyword rather than the author's text, did not deterministically
// deduplicate records, silently dropped malformed rows, and converted a very
// small keyword sample into a public "reputation score". Those properties are
// not adequate for a mental-health resource product.
//
// Use scripts/research/prepare-social-data.mjs for LOCAL RESEARCH ONLY. A public
// publishing pipeline requires reviewed provenance, entity resolution, privacy
// assessment, minimum-evidence rules, and a separately approved product spec.

console.error([
  'This production social-score generator is disabled.',
  'Use scripts/research/prepare-social-data.mjs for local research output under work/.',
  'Do not publish user-generated text or institution scores from that output.'
].join('\n'));
process.exitCode = 1;
