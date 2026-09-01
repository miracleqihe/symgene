import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Layers3,
  ShieldCheck
} from 'lucide-react';
import KineticTitle from './KineticTitle';
import reviewData from '../frontierReviews.json';

const CONFIDENCE_LABELS = {
  较高: '证据较一致',
  中高: '证据总体一致',
  中等: '仍需更多验证'
};

export default function FrontierReviewsPage({ focusOnMount, onPageFocused }) {
  const [activeMenuId, setActiveMenuId] = useState(reviewData.menus[0]?.menuId || '');
  const headerRef = useRef(null);
  const articleHeadingRef = useRef(null);
  const onPageFocusedRef = useRef(onPageFocused);
  onPageFocusedRef.current = onPageFocused;

  const activeMenu = useMemo(
    () => reviewData.menus.find((menu) => menu.menuId === activeMenuId) || reviewData.menus[0],
    [activeMenuId]
  );

  useEffect(() => {
    if (!focusOnMount) return undefined;
    const frame = window.requestAnimationFrame(() => {
      headerRef.current?.focus({ preventScroll: true });
      onPageFocusedRef.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnMount]);

  function selectMenu(menuId) {
    setActiveMenuId(menuId);
    window.requestAnimationFrame(() => articleHeadingRef.current?.focus({ preventScroll: true }));
  }

  if (!activeMenu) return null;

  return (
    <div className="page frontier-reviews-page page-enter">
      <header
        ref={headerRef}
        className="page-header page-header-teal frontier-page-header"
        tabIndex={-1}
      >
        <div className="page-title-group">
          <span className="page-kicker">05 · FRONTIER REVIEWS</span>
          <KineticTitle as="h1" text={reviewData.moduleTitle} mode="converge" replayKey="frontier-reviews" />
          <p>{reviewData.pageCopy.moduleSubtitle}</p>
        </div>
        <div className="page-actions">
          <span className="count-label">{reviewData.menus.length} 个主题 · {countReferences(reviewData.menus)} 篇核心文献</span>
        </div>
      </header>

      <section className="frontier-intro" aria-labelledby="frontier-intro-title">
        <div>
          <span className="eyebrow">EVIDENCE NAVIGATION</span>
          <h2 id="frontier-intro-title">读懂正在变化的精神医学证据</h2>
          <p>{reviewData.pageCopy.landingIntro}</p>
        </div>
        <div className="frontier-safety-note" role="note">
          <ShieldCheck size={19} aria-hidden="true" />
          <p>{reviewData.pageCopy.safetyNotice}</p>
        </div>
      </section>

      <nav className="frontier-topic-nav" aria-label="前沿综述主题">
        {reviewData.menus.map((menu) => (
          <button
            key={menu.menuId}
            type="button"
            className={menu.menuId === activeMenu.menuId ? 'active' : ''}
            aria-current={menu.menuId === activeMenu.menuId ? 'page' : undefined}
            onClick={() => selectMenu(menu.menuId)}
          >
            <span>{String(menu.order).padStart(2, '0')}</span>
            <strong>{menu.titleZh}</strong>
            <small>{menu.kicker}</small>
          </button>
        ))}
      </nav>

      <article className="frontier-article" aria-labelledby="frontier-article-title">
        <header className="frontier-article-head">
          <div>
            <span className="eyebrow">{activeMenu.titleEn}</span>
            <h2 id="frontier-article-title" ref={articleHeadingRef} tabIndex={-1}>{activeMenu.titleZh}</h2>
            <p>{activeMenu.synopsis}</p>
          </div>
          <dl className="frontier-meta">
            <div><dt><CalendarDays size={14} />文献截止</dt><dd>{activeMenu.editorial.literatureCutoff}</dd></div>
            <div><dt><CheckCircle2 size={14} />编辑状态</dt><dd>人工复核稿</dd></div>
            <div><dt><BookOpen size={14} />核心文献</dt><dd>{activeMenu.references.length} 篇</dd></div>
          </dl>
        </header>

        <div className="frontier-body-grid">
          <div className="frontier-narrative">
            {activeMenu.bodySections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                <div className="frontier-body-citations" aria-label={`${section.heading}相关文献`}>
                  <span>相关文献：</span>
                  {section.referenceIds.map((referenceId) => {
                    const reference = activeMenu.references.find((item) => item.id === referenceId);
                    if (!reference) return null;
                    return (
                      <a
                        key={referenceId}
                        href={reference.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={reference.title}
                      >
                        {referenceId}
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <aside className="frontier-reading-guide" aria-label="阅读提示">
            <Layers3 size={20} aria-hidden="true" />
            <h3>如何阅读证据标签</h3>
            <p>{reviewData.pageCopy.evidenceHelp}</p>
            <p className="frontier-updated">{reviewData.pageCopy.updatedLabel}</p>
          </aside>
        </div>

        <section className="frontier-claims" aria-labelledby="frontier-claims-title">
          <div className="frontier-section-heading">
            <span>CLAIMS</span>
            <h3 id="frontier-claims-title">关键结论与边界</h3>
          </div>
          <div className="frontier-claim-grid">
            {activeMenu.keyClaims.map((claim) => (
              <article key={claim.claimId} className="frontier-claim-card">
                <div className="frontier-claim-status">
                  <span>{claim.confidence}</span>
                  <small>{CONFIDENCE_LABELS[claim.confidence] || '持续评估'}</small>
                </div>
                <h4>{claim.text}</h4>
                <p>{claim.evidenceSummary}</p>
                <div className="frontier-claim-boundary"><CircleAlert size={14} />{claim.uncertainty}</div>
                <small>来源：{claim.referenceIds.join('、')}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="frontier-references" aria-labelledby="frontier-references-title">
          <div className="frontier-section-heading">
            <span>REFERENCES</span>
            <h3 id="frontier-references-title">本章核心文献</h3>
          </div>
          <p className="frontier-reference-note"></p>
          <ol>
            {activeMenu.references.map((reference) => (
              <li key={reference.id}>
                <span className="frontier-reference-id">{reference.id}</span>
                <div>
                  <p><strong>{reference.authorsDisplay} ({reference.year})</strong> {reference.title}</p>
                  <span>{reference.journal} · {reference.evidenceType}</span>
                  <small>{reference.editorialRole}</small>
                  <p className="frontier-reference-abstract"><strong>简述：</strong>{reference.abstractZh}</p>
                </div>
                <a href={reference.canonicalUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${reference.title} 的 DOI 页面`}>
                  DOI <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  );
}

function countReferences(menus) {
  return menus.reduce((total, menu) => total + menu.references.length, 0);
}
