import React from 'react';
import { BookOpen, CircleHelp, FileText, FlaskConical, HeartPulse } from 'lucide-react';
import { EntryRow } from '../components/knowledge/EntryRow.jsx';
import { DescriptionSearch } from '../components/search/DescriptionSearch.jsx';

export function HomePage({
  counts,
  onNavigate,
  onOpen,
  query,
  setQuery,
  searchResults,
  searchInputRef
}) {
  return (
    <div className="page home-page page-enter">
      <section className="hero">
        <div className="hero-image" aria-hidden="true" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <span className="eyebrow light">SYM GEN · OPEN KNOWLEDGE BASE</span>
          <h1>Sym Gen<br /><span>心鉴 · 精神与心理健康科普</span></h1>
          <p>把复杂的精神健康知识，整理成可以查阅、共同维护的公开词条。</p>
          <div className="hero-meta">
            <span><i className="live-mark" /> 内容持续整理中</span>
            <span>更新于 2026.07</span>
          </div>
        </div>
        <div className="hero-note">
          <CircleHelp size={15} />
          <span>面向公众的阅读版<br />不替代医生的诊断与处方</span>
        </div>
      </section>

      <section className="reader-note">
        <div><span className="eyebrow">致读者</span><h2>先描述发生了什么，再看可能相关的线索。</h2></div>
        <p>
          把你的感受、持续时间、睡眠变化和对生活的影响写下来。心鉴会先整理疾病线索与相似案例，
          再展示关联的治疗和药物资料；结果不是诊断，也不能替代面对面的专业评估。
        </p>
      </section>

      <DescriptionSearch
        query={query}
        setQuery={setQuery}
        results={searchResults}
        onOpen={onOpen}
        searchInputRef={searchInputRef}
      />

      <section className="collection-block">
        <div className="section-heading">
          <div><span className="eyebrow">知识入口</span><h2>从这里继续阅读</h2></div>
          <span className="section-index">02 / 05</span>
        </div>
        <div className="entry-list">
          <EntryRow index="01" title="精神药物" text="作用、动力学、联用与禁忌，按分类快速查看。" count={counts.drugs + ' 个词条'} onClick={() => onNavigate('drugs')} accent="blue" icon={<FlaskConical size={19} />} />
          <EntryRow index="02" title="疾病科普" text="从症状、病程与功能影响理解常见精神障碍。" count={counts.disorders + ' 个词条'} onClick={() => onNavigate('disorders')} accent="yellow" icon={<HeartPulse size={19} />} />
          <EntryRow index="03" title="案例分析" text="按疾病分类的案例单元，练习评估与沟通思路。" count={counts.cases + ' 个案例'} onClick={() => onNavigate('cases')} accent="ink" icon={<FileText size={19} />} />
          <EntryRow index="04" title="网络资源" text="可靠的网站与开放资料入口，离开本站前往查看。" count={counts.resources + ' 项资源'} onClick={() => onNavigate('resources')} accent="yellow" icon={<BookOpen size={19} />} />
        </div>
      </section>

      <footer className="home-footer">
        <span>Sym Gen 心鉴 / 一个可共同维护的公益资料室</span>
        <span>资料版本 0.2 · 本地优先</span>
      </footer>
    </div>
  );
}
