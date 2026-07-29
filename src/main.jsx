import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight, BookOpen, Brain, ChevronRight, CircleHelp, Edit3, ExternalLink,
  FileText, FlaskConical, HeartPulse, Home, Library, Menu, Plus, Search, ShieldCheck,
  Sparkles, Trash2, X
} from 'lucide-react';
import { cloneSeed, navItems, typeLabels } from './data';
import { matchKnowledge } from './search';
import symGenMark from './assets/sym-gen-mark.svg';
import './styles.css';

const STORAGE_KEY = 'symgene-wiki-data-v1';
const CAN_EDIT = import.meta.env.DEV;
const DATA_VERSION = 10;
const DISORDER_CATEGORY_ORDER = [
  '脑器质性及躯体疾病所致精神障碍', '中毒所致精神障碍', '精神活性物质与行为成瘾所致精神障碍',
  '物质所致精神障碍', '精神分裂症及其他妄想障碍', '心境障碍', '应激相关障碍', '神经症及癔症',
  '强迫及相关障碍', '躯体症状及相关障碍', '解离障碍', '人格障碍', '性健康与性相关困扰',
  '心理生理障碍', '睡眠障碍', '儿童期心理发育障碍', '冲动控制与行为成瘾'
];

function sanitizeData(value) {
  const seed = cloneSeed();
  const next = value || seed;
  const isLegacy = next.meta?.version !== DATA_VERSION;
  const savedDrugs = next.drugs || [];
  const canonicalById = new Map(seed.drugs.map((item) => [item.id, item]));
  const normalizedSavedDrugs = savedDrugs.map((saved) => {
    const canonical = canonicalById.get(saved.id);
    if (!canonical) return saved;
    return { ...canonical, ...saved, className: canonical.className, categoryLabel: canonical.categoryLabel, section: canonical.section, classOrder: canonical.classOrder, source: canonical.source, updated: canonical.updated };
  });
  const mergedDrugs = isLegacy
    ? [...normalizedSavedDrugs, ...seed.drugs.filter((item) => !savedDrugs.some((saved) => saved.id === item.id))]
    : normalizedSavedDrugs;
  const mergedDisorders = isLegacy ? seed.disorders : (next.disorders || seed.disorders);
  const mergedCases = isLegacy ? seed.cases : (next.cases || seed.cases);
  const savedResources = (next.resources || []).filter((item) => !item.localPath && !String(item.source || '').startsWith('raw/'));
  const mergedResources = isLegacy
    ? [...savedResources, ...seed.resources.filter((item) => !savedResources.some((saved) => saved.id === item.id))]
    : savedResources;
  return {
    ...next,
    meta: { ...(next.meta || {}), version: DATA_VERSION },
    drugs: mergedDrugs,
    disorders: mergedDisorders,
    cases: mergedCases,
    resources: mergedResources
  };
}

function readData() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeData(saved ? JSON.parse(saved) : cloneSeed());
  } catch {
    return sanitizeData(null);
  }
}

function App() {
  const [data, setData] = useState(readData);
  const [activePage, setActivePage] = useState('home');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const counts = useMemo(() => ({
    drugs: data.drugs.length,
    disorders: data.disorders.length,
    cases: data.cases.length,
    resources: data.resources.length
  }), [data]);

  const searchResults = useMemo(() => matchKnowledge(query, data), [data, query]);

  if (!entered) return <WelcomeScreen onEnter={() => setEntered(true)} />;

  function go(page) {
    setActivePage(page);
    setSelected(null);
    setQuery('');
    setMobileNav(false);
  }

  function openItem(type, item) {
    setActivePage(type);
    setSelected(item);
    setQuery('');
    setMobileNav(false);
  }

  function startEdit(type, item = null) {
    setEditor({ type, item: item ? { ...item } : makeBlank(type) });
  }

  function makeBlank(type) {
    if (type === 'drugs') return { id: 'drug-' + Date.now(), name: '', aliases: '', className: '待补充分类', indication: '', action: '', kinetics: '', interactions: '', contraindications: '', source: '待补充来源', updated: new Date().toISOString().slice(0, 10) };
    if (type === 'disorders') return { id: 'disorder-' + Date.now(), name: '', aliases: [], category: '待分类', summary: '', details: '', symptoms: [], patientPhrases: [], courseClues: [], functionalImpact: [], assessment: [], differentials: [], treatmentOverview: [], emergencySignals: [], relatedDrugIds: [], source: '待补充来源' };
    if (type === 'cases') return { id: 'case-' + Date.now(), disorderId: data.disorders[0]?.id || '', title: '', stage: '待整理', tags: [], summary: '', presentation: [], timeline: '', functionImpact: '', riskSignals: '', assessmentFocus: [], differentialClues: [], safetyNote: '', source: '待补充来源' };
    return { id: 'resource-' + Date.now(), kind: '网站', title: '', description: '', url: '', source: '' };
  }

  function saveEditor(nextItem) {
    const type = editor.type;
    setData((current) => {
      const list = current[type] || [];
      const found = list.some((item) => item.id === nextItem.id);
      return { ...current, [type]: found ? list.map((item) => item.id === nextItem.id ? nextItem : item) : [nextItem, ...list] };
    });
    setSelected(nextItem);
    setEditor(null);
    setToast('已保存到本地浏览器');
  }

  function deleteItem(type, item) {
    if (!window.confirm('确定删除“' + (item.name || item.title) + '”吗？')) return;
    setData((current) => ({ ...current, [type]: current[type].filter((entry) => entry.id !== item.id) }));
    setSelected(null);
    setToast('词条已删除');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')} aria-label="Sym Gen 心鉴，回到首页">
          <span className="brand-mark"><img src={symGenMark} alt="" /></span>
          <span><strong>Sym Gen</strong><em>心鉴 · WIKI</em></span>
        </button>
        <div className="topbar-actions">
          <span className="status-dot"><i /> {CAN_EDIT ? '本地编辑模式' : '公开阅读模式'}</span>
          <button className="icon-button menu-toggle" onClick={() => setMobileNav(!mobileNav)} aria-label="打开导航"><Menu size={20} /></button>
        </div>
      </header>

      <div className="layout">
        <aside className={'sidebar ' + (mobileNav ? 'is-open' : '')}>
          <div className="side-intro"><span className="eyebrow">OPEN KNOWLEDGE ROOM</span><p>给每一种感受<br />一份可靠的解释</p></div>
          <nav className="main-nav" aria-label="主导航">
            {navItems.map((item) => <button key={item.id} className={activePage === item.id ? 'active' : ''} onClick={() => go(item.id)}><NavIcon id={item.id} /><span>{item.label}</span>{item.id !== 'home' && <small>{counts[item.id]}</small>}<ChevronRight size={15} /></button>)}
          </nav>
          <div className="side-foot"><ShieldCheck size={15} /><span>内容用于公共科普<br />不替代专业诊疗</span></div>
        </aside>

        <main className="main-content">
          {activePage === 'home' && <HomePage data={data} counts={counts} onNavigate={go} onOpen={openItem} query={query} setQuery={setQuery} searchResults={searchResults} />}
          {activePage === 'drugs' && <ListPage type="drugs" data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} />}
          {activePage === 'disorders' && <ListPage type="disorders" data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} />}
          {activePage === 'cases' && <CasesPage data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} onOpenDisorder={(disorder) => openItem('disorders', disorder)} />}
          {activePage === 'resources' && <ResourcesPage data={data} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} />}
        </main>
      </div>

      {editor && <EditorModal editor={editor} disorders={data.disorders} onClose={() => setEditor(null)} onSave={saveEditor} />}
      {toast && <div className="toast"><Sparkles size={16} />{toast}</div>}
    </div>
  );
}

function WelcomeScreen({ onEnter }) {
  return <main className="welcome-screen">
    <div className="welcome-content">
      <div className="welcome-symbol" aria-hidden="true"><img src={symGenMark} alt="" /></div>
      <h1>Sym Gen</h1>
      <p className="welcome-subtitle">心鉴 · 精神与心理健康百科</p>
      <p className="welcome-description">系统整理精神疾病与药物的分类、诊疗思路和临床信息，<br />做一册可以随时查阅的公开知识库。</p>
      <div className="welcome-status"><i />内容持续整理中</div>
      <p className="welcome-date">更新于 2026.07</p>
      <span className="welcome-divider" aria-hidden="true" />
      <button className="welcome-enter" onClick={onEnter}>进入知识库 <ArrowUpRight size={18} /></button>
    </div>
    <p className="welcome-disclaimer">本站仅供信息参考，不替代医生的诊断与处方</p>
  </main>;
}

function NavIcon({ id }) {
  const props = { size: 17, strokeWidth: 1.9 };
  if (id === 'home') return <Home {...props} />;
  if (id === 'drugs') return <FlaskConical {...props} />;
  if (id === 'disorders') return <HeartPulse {...props} />;
  if (id === 'cases') return <FileText {...props} />;
  return <Library {...props} />;
}

function HomePage({ data, counts, onNavigate, onOpen, query, setQuery, searchResults }) {
  return <div className="page home-page page-enter">
    <section className="hero">
      <div className="hero-image" aria-hidden="true" />
      <div className="hero-overlay" />
      <div className="hero-content">
        <span className="eyebrow light">SYM GEN · OPEN KNOWLEDGE BASE</span>
        <h1>Sym Gen<br /><span>心鉴 · 精神与心理健康科普</span></h1>
        <p>把复杂的精神健康知识，整理成可以查阅、共同维护的公开词条。</p>
        <div className="hero-meta"><span><i className="live-mark" /> 内容持续整理中</span><span>更新于 2026.07</span></div>
      </div>
      <div className="hero-note"><CircleHelp size={15} /><span>面向公众的阅读版<br />不替代医生的诊断与处方</span></div>
    </section>

    <section className="reader-note">
      <div><span className="eyebrow">致读者</span><h2>先描述发生了什么，再看可能相关的线索。</h2></div>
      <p>把你的感受、持续时间、睡眠变化和对生活的影响写下来。心鉴会先整理疾病线索与相似案例，再展示关联的治疗和药物资料；结果不是诊断，也不能替代面对面的专业评估。</p>
    </section>

    <DescriptionSearch query={query} setQuery={setQuery} results={searchResults} onOpen={onOpen} />

    <section className="collection-block">
      <div className="section-heading"><div><span className="eyebrow">知识入口</span><h2>从这里继续阅读</h2></div><span className="section-index">02 / 05</span></div>
      <div className="entry-list">
        <EntryRow index="01" title="精神药物" text="作用、动力学、联用与禁忌，按分类快速查看。" count={counts.drugs + ' 个词条'} onClick={() => onNavigate('drugs')} accent="blue" icon={<FlaskConical size={19} />} />
        <EntryRow index="02" title="疾病科普" text="从症状、病程与功能影响理解常见精神障碍。" count={counts.disorders + ' 个词条'} onClick={() => onNavigate('disorders')} accent="yellow" icon={<HeartPulse size={19} />} />
        <EntryRow index="03" title="案例分析" text="按疾病分类的案例单元，练习评估与沟通思路。" count={counts.cases + ' 个案例'} onClick={() => onNavigate('cases')} accent="ink" icon={<FileText size={19} />} />
        <EntryRow index="04" title="网络资源" text="可靠的网站与开放资料入口，离开本站前往查看。" count={counts.resources + ' 项资源'} onClick={() => onNavigate('resources')} accent="yellow" icon={<BookOpen size={19} />} />
      </div>
    </section>

    <footer className="home-footer"><span>Sym Gen 心鉴 / 一个可共同维护的公益资料室</span><span>资料版本 0.2 · 本地优先</span></footer>
  </div>;
}

function EntryRow({ index, title, text, count, onClick, accent, icon }) {
  return <button className="entry-row" onClick={onClick}><span className={'entry-icon ' + accent}>{icon}</span><span className="entry-index">{index}</span><span className="entry-copy"><strong>{title}</strong><small>{text}</small></span><span className="entry-count">{count}</span><ArrowUpRight className="entry-arrow" size={18} /></button>;
}

function DescriptionSearch({ query, setQuery, results, onOpen }) {
  const hasKnowledge = results.disorders.length || results.cases.length || results.drugs.length;
  return <section className="search-block description-search">
    <div className="section-heading"><div><span className="eyebrow">描述式检索</span><h2>把正在经历的情况写下来</h2></div><span className="section-index">01 / 05</span></div>
    <div className="search-wrap"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：三个月都很累，早醒，不想见人" aria-label="描述你正在经历的情况" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="清除描述"><X size={16} /></button>}<kbd>⌘ K</kbd></div>
    {query && <div className="search-results search-results-rich">
      {results.risk && <div className={'risk-banner ' + results.risk.level}><ShieldCheck size={18} /><div><strong>{results.risk.labels.join(' · ')}</strong><p>{results.risk.message}</p></div></div>}
      {results.disorders.length > 0 && <SearchGroup label="可能相关的疾病线索" note="按症状、时间线和功能影响排序"><div className="search-result-list">{results.disorders.map(({ item, hits }) => <SearchResult key={'disorder-' + item.id} type="disorders" item={item} hits={hits} onOpen={onOpen} />)}</div></SearchGroup>}
      {results.cases.length > 0 && <SearchGroup label="相似案例" note="用于理解评估重点，不代表与你相同"><div className="search-result-list">{results.cases.map(({ item, hits }) => <SearchResult key={'case-' + item.id} type="cases" item={item} hits={hits} onOpen={onOpen} />)}</div></SearchGroup>}
      {results.drugs.length > 0 && <SearchGroup label="关联治疗与药物资料" note="来自已匹配的疾病线索，仅供阅读"><div className="search-result-list">{results.drugs.map((item) => <SearchResult key={'drug-' + item.id} type="drugs" item={item} hits={[item.categoryLabel]} onOpen={onOpen} />)}</div></SearchGroup>}
      {results.directDrugHint && <div className="search-hint"><FlaskConical size={16} /><span>你输入了药物名称。心鉴先从疾病和案例解释它可能出现的治疗语境；完整药物分类请打开“药物”目录查看。</span></div>}
      {!hasKnowledge && !results.risk && !results.directDrugHint && <div className="empty-search">暂时没有足够的匹配线索。可以补充持续多久、睡眠/精力变化，以及对工作或关系的影响。</div>}
    </div>}
  </section>;
}

function SearchGroup({ label, note, children }) {
  return <section className="search-group"><div className="search-group-heading"><strong>{label}</strong><span>{note}</span></div>{children}</section>;
}

function SearchResult({ type, item, hits, onOpen }) {
  const title = item.name || item.title;
  const subtitle = type === 'cases' ? item.stage : type === 'drugs' ? item.aliases : item.category;
  return <button className="search-result" onClick={() => onOpen(type, item)}><span className={'result-type ' + type}>{typeLabels[type]}</span><span className="result-copy"><strong>{title}</strong><small>{subtitle}</small>{hits?.length > 0 && <em>命中：{hits.join('、')}</em>}</span><ArrowUpRight size={17} /></button>;
}

function ListPage({ type, data, selected, onSelect, onEdit, onDelete, onAdd }) {
  const detailRef = useRef(null);
  const items = data[type];
  const label = type === 'drugs' ? '精神药物' : '疾病科普';
  useEffect(() => {
    if (!selected || !window.matchMedia('(max-width: 720px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);
  return <div className="page library-page page-enter">
    <PageHeader eyebrow={type === 'drugs' ? 'MEDICATIONS' : 'DISORDERS'} title={label} description={type === 'drugs' ? '按《精神药物手册》的章节与药理学分类整理常见精神科药物。' : '从症状、病程与功能影响出发，建立可读的疾病词条。'} count={items.length + ' 个词条'} onAdd={() => onAdd(type)} addLabel="新增词条" />
    <div className="workspace-grid">
      <section className={'index-panel ' + (type === 'drugs' ? 'drug-index-panel' : 'disorder-index-panel')}><div className="panel-label">分类索引 <span>{String(items.length).padStart(2, '0')}</span></div>{type === 'drugs' ? <DrugIndex items={items} selected={selected} onSelect={onSelect} /> : <DisorderIndex items={items} selected={selected} onSelect={onSelect} />}</section>
      <section className="detail-panel" ref={detailRef}>{selected ? <Detail type={type} item={selected} onEdit={() => onEdit(type, selected)} onDelete={() => onDelete(type, selected)} /> : <EmptyDetail type={type} onChoose={() => items[0] && onSelect(items[0])} />}</section>
    </div>
  </div>;
}

function DisorderIndex({ items, selected, onSelect }) {
  const groups = items.reduce((result, item) => {
    const name = item.category || '待分类';
    const group = result.find((entry) => entry.name === name);
    if (group) group.items.push(item);
    else result.push({ name, items: [item] });
    return result;
  }, []);
  groups.sort((a, b) => {
    const ai = DISORDER_CATEGORY_ORDER.indexOf(a.name);
    const bi = DISORDER_CATEGORY_ORDER.indexOf(b.name);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return <div className="disorder-index">{groups.map((group) => <section className="disorder-category" key={group.name}><div className="disorder-category-head"><strong>{group.name}</strong><small>{group.items.length}</small></div><div className="index-list">{group.items.map((item) => <button key={item.id} className={selected?.id === item.id ? 'selected' : ''} onClick={() => onSelect(item)}><span>{item.name}</span><small>{item.aliases?.join(' · ')}</small><ChevronRight size={15} /></button>)}</div></section>)}</div>;
}

function DrugIndex({ items, selected, onSelect }) {
  const sections = [];
  items.forEach((item) => {
    const sectionName = item.section || '待补充章节';
    let section = sections.find((entry) => entry.name === sectionName);
    if (!section) {
      section = { name: sectionName, order: item.classOrder || 999, categories: [] };
      sections.push(section);
    }
    const categoryLabel = item.categoryLabel || item.className || '待补充分类';
    let category = section.categories.find((entry) => entry.name === categoryLabel);
    if (!category) {
      category = { name: categoryLabel, description: item.className, order: item.classOrder || 999, items: [] };
      section.categories.push(category);
    }
    category.items.push(item);
  });
  sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
  sections.forEach((section) => section.categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN')));
  return <div className="drug-index">{sections.map((section) => <section className="drug-section" key={section.name}><div className="drug-section-head"><strong>{section.name}</strong><span>{section.categories.reduce((total, category) => total + category.items.length, 0)} 个词条</span></div>{section.categories.map((category) => <div className="drug-category" key={category.name}><div className="drug-category-head"><div><strong>{category.name}</strong>{category.description && category.description !== category.name && <span>{category.description}</span>}</div><small>{category.items.length}</small></div><div className="index-list">{category.items.map((item) => <button key={item.id} className={selected?.id === item.id ? 'selected' : ''} onClick={() => onSelect(item)}><span>{item.name}</span><small>{item.aliases}</small><ChevronRight size={15} /></button>)}</div></div>)}</section>)}</div>;
}

function Detail({ type, item, onEdit, onDelete }) {
  const isDrug = type === 'drugs';
  return <article className="detail-article"><div className="detail-top"><div><span className="eyebrow">{isDrug ? (item.categoryLabel || item.className) : item.category}</span><h2>{item.name}</h2><p className="aliases">{isDrug ? item.aliases : item.aliases?.join(' · ') || '疾病词条 · 公共阅读版'}</p>{isDrug && item.className && item.className !== item.categoryLabel && <p className="detail-class">{item.className}</p>}</div>{CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑词条"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除词条"><Trash2 size={17} /></button></div>}</div>{isDrug ? <div className="fact-grid"><Fact label="适用情境" text={item.indication} /><Fact label="药物作用" text={item.action} /><Fact label="药物动力学" text={item.kinetics} /><Fact label="药物联用效果" text={item.interactions} /><Fact label="禁忌与警示" text={item.contraindications} warning /></div> : <DiseaseFacts item={item} />}<SourceLine text={item.source} /></article>;
}

function DiseaseFacts({ item }) {
  return <div className="disease-copy"><Fact label="介绍" text={item.summary} /><Fact label="如何理解" text={item.details} /><ListFact label="常见体验" items={item.symptoms} /><ListFact label="来访者可能这样描述" items={item.patientPhrases} /><ListFact label="病程线索" items={item.courseClues} /><ListFact label="可能影响" items={item.functionalImpact} /><ListFact label="评估时会关注" items={item.assessment} /><ListFact label="需要鉴别" items={item.differentials} /><ListFact label="治疗与支持概览" items={item.treatmentOverview} /><ListFact label="需要尽快求助的信号" items={item.emergencySignals} warning /></div>;
}

function Fact({ label, text, warning }) { return <div className={'fact ' + (warning ? 'warning' : '')}><span>{label}</span><p>{text || '待补充'}</p></div>; }
function ListFact({ label, items, warning }) { return <div className={'fact fact-list ' + (warning ? 'warning' : '')}><span>{label}</span>{items?.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>待补充</p>}</div>; }
function SourceLine({ text }) { return <div className="source-line"><BookOpen size={14} /><span>{text}</span></div>; }
function EmptyDetail({ type, onChoose }) { return <div className="empty-detail"><span className="empty-mark"><Brain size={25} /></span><h3>选择一个{type === 'drugs' ? '药物' : '疾病'}词条</h3><p>从左侧索引开始，查看结构化内容与来源说明。</p><button className="text-button" onClick={onChoose}>打开第一个词条 <ArrowUpRight size={15} /></button></div>; }

function CasesPage({ data, selected, onSelect, onEdit, onDelete, onAdd, onOpenDisorder }) {
  const detailRef = useRef(null);
  const selectedDisorder = selected ? data.disorders.find((item) => item.id === selected.disorderId) : null;
  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);
  const disorders = [...data.disorders].sort((a, b) => {
    const ai = DISORDER_CATEGORY_ORDER.indexOf(a.category);
    const bi = DISORDER_CATEGORY_ORDER.indexOf(b.category);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return <div className="page library-page page-enter"><PageHeader eyebrow="CASE NOTES" title="案例分析" description="按疾病词条分组的教学性案例，用于练习观察、评估与沟通。" count={data.cases.length + ' 个案例'} onAdd={() => onAdd('cases')} addLabel="新增案例" />{selected && <CaseDetail detailRef={detailRef} item={selected} disorder={selectedDisorder} onEdit={() => onEdit('cases', selected)} onDelete={() => onDelete('cases', selected)} />}<div className="case-groups">{disorders.map((disorder) => { const cases = data.cases.filter((item) => item.disorderId === disorder.id); return <section className="case-group" key={disorder.id}><div className="case-group-heading"><div><span className="eyebrow">{disorder.category}</span><h2>{disorder.name}</h2></div><button className="link-button" onClick={() => onOpenDisorder(disorder)}>查看疾病词条 <ChevronRight size={15} /></button></div>{cases.length ? <div className="case-list">{cases.map((item) => <CaseRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={onSelect} onEdit={() => onEdit('cases', item)} onDelete={() => onDelete('cases', item)} />)}</div> : <p className="muted">还没有案例，点击右上角新增。</p>}</section>; })}</div></div>;
}

function CaseRow({ item, selected, onSelect, onEdit, onDelete }) { return <div className={'case-row ' + (selected ? 'selected' : '')}><button onClick={() => onSelect(item)} className="case-main"><span className="case-stage">{item.stage}</span><strong>{item.title}</strong><p>{item.summary}</p><span className="tag-line">{(item.tags || []).map((tag) => <em key={tag}>{tag}</em>)}</span></button>{CAN_EDIT && <div className="row-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={16} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={16} /></button></div>}</div>; }

function CaseDetail({ item, disorder, onEdit, onDelete, detailRef }) {
  return <article className="case-detail" ref={detailRef}><div className="detail-top"><div><span className="eyebrow">{disorder?.category || 'CASE NOTE'} · {item.stage}</span><h2>{item.title}</h2><p className="aliases">{disorder?.name || '教学性案例'} · 合成案例</p></div>{CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={17} /></button></div>}</div><div className="fact-grid"><Fact label="案例摘要" text={item.summary} /><Fact label="表现" text={(item.presentation || []).join('；')} /><Fact label="时间线" text={item.timeline} /><Fact label="功能影响" text={item.functionImpact} /><Fact label="评估重点" text={(item.assessmentFocus || []).join('；')} /><Fact label="鉴别提示" text={(item.differentialClues || []).join('；')} /><Fact label="风险线索" text={item.riskSignals} warning /><Fact label="安全提醒" text={item.safetyNote} warning /></div><SourceLine text={item.source} /></article>;
}

function ResourcesPage({ data, onEdit, onDelete, onAdd }) { return <div className="page library-page page-enter"><PageHeader eyebrow="LIBRARY" title="网络资源" description="外部网站与开放资料的统一入口，原始书籍仅作为项目内部依据。" count={data.resources.length + ' 项资源'} onAdd={() => onAdd('resources')} addLabel="新增资源" /><div className="resource-list">{data.resources.map((item) => <article className="resource-row" key={item.id}><div className={'resource-kind ' + (item.kind === '书籍' ? 'yellow' : 'blue')}>{item.kind === '书籍' ? <BookOpen size={18} /> : <ExternalLink size={18} />}</div><div className="resource-copy"><span className="eyebrow">{item.source}</span><h2>{item.title}</h2><p>{item.description}</p></div><div className="row-actions"><a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label="打开资源"><ArrowUpRight size={17} /></a>{CAN_EDIT && <><button className="icon-button" onClick={() => onEdit('resources', item)} aria-label="编辑资源"><Edit3 size={16} /></button><button className="icon-button danger" onClick={() => onDelete('resources', item)} aria-label="删除资源"><Trash2 size={16} /></button></>}</div></article>)}</div><div className="resource-note"><ExternalLink size={17} /><p>这里仅展示公开网络链接。项目内的三本 PDF 保存在 <code>raw/</code>，不会作为网络资源开放。</p></div></div>; }

function PageHeader({ eyebrow, title, description, count, onAdd, addLabel }) { return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="page-header-actions"><span className="count-label">{count}</span>{CAN_EDIT && <button className="primary-button" onClick={onAdd}><Plus size={16} /> {addLabel}</button>}</div></div>; }

function EditorModal({ editor, disorders, onClose, onSave }) {
  const [form, setForm] = useState(editor.item);
  const type = editor.type;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const parseList = (value) => Array.isArray(value) ? value : String(value || '').split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
  const submit = (event) => {
    event.preventDefault();
    const next = { ...form };
    if (type === 'disorders') ['aliases', 'symptoms', 'patientPhrases', 'courseClues', 'functionalImpact', 'assessment', 'differentials', 'treatmentOverview', 'emergencySignals', 'relatedDrugIds'].forEach((key) => { next[key] = parseList(form[key]); });
    if (type === 'cases') ['tags', 'presentation', 'assessmentFocus', 'differentialClues'].forEach((key) => { next[key] = parseList(form[key]); });
    onSave(next);
  };
  const field = (label, key, options = {}) => {
    const value = options.list && Array.isArray(form[key]) ? form[key].join('\n') : (form[key] || '');
    return <label className={options.wide ? 'wide' : ''}><span>{label}</span>{options.select ? <select value={value} onChange={(event) => update(key, event.target.value)}>{options.select.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : options.textarea ? <textarea rows={options.rows || 4} value={value} onChange={(event) => update(key, event.target.value)} /> : <input value={value} onChange={(event) => update(key, event.target.value)} />}</label>;
  };
  const listField = (label, key) => field(label, key, { textarea: true, wide: true, list: true, rows: 3 });
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="editor-modal" role="dialog" aria-modal="true" aria-label="编辑词条"><div className="modal-head"><div><span className="eyebrow">LOCAL EDITOR</span><h2>{editor.item.name || editor.item.title ? '编辑词条' : '新增词条'}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div><form onSubmit={submit}><div className="form-grid">
    {type === 'drugs' && <>{field('名称', 'name')}{field('别名', 'aliases')}{field('章节', 'section')}{field('子分类', 'categoryLabel')}{field('分类全称', 'className', { wide: true })}{field('适用情境', 'indication', { textarea: true, wide: true })}{field('药物作用', 'action', { textarea: true, wide: true })}{field('药物动力学', 'kinetics', { textarea: true, wide: true })}{field('药物联用效果', 'interactions', { textarea: true, wide: true })}{field('禁忌与警示', 'contraindications', { textarea: true, wide: true })}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'disorders' && <>{field('名称', 'name')}{field('分类', 'category')}{listField('别名（每行一项）', 'aliases')}{field('一句话介绍', 'summary', { textarea: true, wide: true })}{field('如何理解', 'details', { textarea: true, wide: true })}{listField('常见体验', 'symptoms')}{listField('来访者可能这样描述', 'patientPhrases')}{listField('病程线索', 'courseClues')}{listField('可能影响', 'functionalImpact')}{listField('评估时会关注', 'assessment')}{listField('需要鉴别', 'differentials')}{listField('治疗与支持概览', 'treatmentOverview')}{listField('需要尽快求助的信号', 'emergencySignals')}{listField('关联药物 ID', 'relatedDrugIds')}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'cases' && <>{field('案例标题', 'title', { wide: true })}{field('所属疾病', 'disorderId', { select: disorders.map((item) => ({ value: item.id, label: item.name })) })}{field('阶段标签', 'stage')}{field('案例摘要', 'summary', { textarea: true, wide: true })}{listField('主题标签', 'tags')}{listField('表现', 'presentation')}{field('时间线', 'timeline', { textarea: true, wide: true })}{field('功能影响', 'functionImpact', { textarea: true, wide: true })}{field('风险线索', 'riskSignals', { textarea: true, wide: true })}{listField('评估重点', 'assessmentFocus')}{listField('鉴别提示', 'differentialClues')}{field('安全提醒', 'safetyNote', { textarea: true, wide: true })}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'resources' && <>{field('资源标题', 'title', { wide: true })}{field('类型', 'kind', { select: [{ value: '网站', label: '网站' }, { value: '书籍', label: '书籍' }, { value: '指南', label: '指南' }, { value: '其他', label: '其他' }] })}{field('来源', 'source')}{field('描述', 'description', { textarea: true, wide: true })}{field('外部网址', 'url', { wide: true })}</>}
  </div><div className="modal-foot"><span><ShieldCheck size={14} /> 保存只写入本浏览器</span><div><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button"><Sparkles size={16} /> 保存词条</button></div></div></form></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
