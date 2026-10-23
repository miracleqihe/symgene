const statuses = new Set(['cn_product_verified', 'cn_status_unverified', 'overseas_reference_only']);
const hasText = value => typeof value === 'string' && !!value.trim();
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

// Editorial metadata is inspected privately; this is not a regulatory opinion.
export function auditRegionalCoverage(drugs, profiles) {
  const entries = drugs.map(drug => {
    const profile = profiles[drug.id];
    const review = profile?.regionalReview;
    const sources = new Map((profile?.sources || []).map(source => [source.id, source]));
    const problems = [];
    if (!review) problems.push('missing_regional_review');
    else {
      const productIds = Array.isArray(review.productSourceIds) ? review.productSourceIds : [];
      const comparisonIds = Array.isArray(review.comparisonSourceIds) ? review.comparisonSourceIds : [];
      const limitations = Array.isArray(review.limitations) ? review.limitations : [];
      if (review.audience !== 'CN-mainland' || !statuses.has(review.status)) problems.push('invalid_regional_scope');
      if (!date(review.checkedAt)) problems.push('missing_review_date');
      if (!Array.isArray(review.limitations)) problems.push('missing_limitations_record');
      if (!Array.isArray(review.productSourceIds) || !Array.isArray(review.comparisonSourceIds)) problems.push('invalid_source_id_list');
      if (review.status !== 'cn_product_verified' && !limitations.some(hasText)) problems.push('unexplained_regional_limit');
      if (review.status === 'cn_product_verified' && !productIds.length) problems.push('missing_chinese_product_source');
      for (const id of productIds) {
        const source = sources.get(id);
        const product = source?.product;
        if (!source || source.kind !== 'label' || source.region !== '中国大陆' || !source.language?.startsWith('zh')) {
          problems.push('invalid_chinese_product_source');
          continue;
        }
        if (!date(source.updated) || !date(source.checkedAt)) problems.push('missing_product_dates');
        if (!hasText(product?.genericName) || !hasText(product?.dosageForm)
          || !hasText(product?.marketingAuthorisationHolder) || !Array.isArray(product?.strengths) || !product.strengths.some(hasText)
          || !Array.isArray(product?.approvalNumbers) || !product.approvalNumbers.some(hasText)) problems.push('incomplete_product_identity');
        const descriptors = [...Object.values(profile.fields || {}),
          ...(profile.amendments || []).map(amendment => amendment.replacement), ...(profile.retainedEvidence || [])];
        if (!descriptors.some(field => field?.refs?.includes(id))) problems.push('unused_chinese_product_source');
      }
      for (const id of comparisonIds) if (!sources.has(id)) problems.push('missing_comparison_source');
    }
    return { id: drug.id, name: drug.name, status: review?.status || 'not_recorded',
      metadataComplete: !problems.length, chineseProductVerified: !problems.length && review.status === 'cn_product_verified', problems };
  });
  return { total: entries.length, metadataComplete: entries.filter(entry => entry.metadataComplete).length,
    chineseProductVerified: entries.filter(entry => entry.chineseProductVerified).length,
    allMetadataComplete: entries.every(entry => entry.metadataComplete), entries,
    note: 'Metadata checks do not prove source authenticity, current approval, clinical correctness or medical review.' };
}
