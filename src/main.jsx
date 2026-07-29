import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowUpRight, BookOpen, Brain, ChevronRight, CircleHelp, Edit3, ExternalLink,
  FileText, FlaskConical, HeartPulse, Home, Library, Menu, Plus, Search, ShieldCheck,
  Sparkles, Trash2, X
} from 'lucide-react';
import { cloneSeed, navItems, typeLabels } from './data';
import { matchKnowledge } from './search';
import AnimatedPresence from './components/AnimatedPresence';
import KineticTitle from './components/KineticTitle';
import KnowledgeIndexGraphic from './components/KnowledgeIndexGraphic';
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
const EMPTY_VIEW = '__empty__';
const NAV_ORDER = new Map(navItems.map((item, index) => [item.id, index]));

function resolvePageDirection(from, to) {
  if (from === 'home' && to !== 'home') return 'forward';
  if (from !== 'home' && to === 'home') return 'backward';
  return (NAV_ORDER.get(to) || 0) >= (NAV_ORDER.get(from) || 0) ? 'lateral-forward' : 'lateral-backward';
}

function resolveDetailDirection(from, to) {
  if (from === EMPTY_VIEW && to !== EMPTY_VIEW) return 'forward';
  if (from !== EMPTY_VIEW && to === EMPTY_VIEW) return 'backward';
  return 'lateral-forward';
}

function resolveForwardDirection() {
  return 'forward';
}

function resolveOverlayDirection() {
  return 'overlay';
}

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
  const savedResources = (next.resources || []).filter((item) =>
    !item.localPath && /^https?:\/\//i.test(String(item.url || ''))
  );
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
  const [storageError, setStorageError] = useState('');
  const [entered, setEntered] = useState(false);
  const [mainScrolled, setMainScrolled] = useState(false);
  const mainContentRef = useRef(null);
  const previousPageRef = useRef(activePage);
  const searchInputRef = useRef(null);
  const focusFrameRef = useRef(null);
  const pendingStorageToastRef = useRef('');

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError('');
      if (pendingStorageToastRef.current) {
        setToast(pendingStorageToastRef.current);
      }
    } catch (error) {
      setToast('');
      setStorageError('本地保存失败，请检查浏览器存储权限或复制当前内容。');
      if (import.meta.env.DEV) {
        console.warn('无法将 Sym Gen 数据写入本地存储。', error);
      }
    } finally {
      pendingStorageToastRef.current = '';
    }
  }, [data]);

  useEffect(() => {
    function focusSearch(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || !entered) return;
      event.preventDefault();
      setActivePage('home');
      setSelected(null);
      setMobileNav(false);
      if (focusFrameRef.current) window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        focusFrameRef.current = null;
      });
    }
    window.addEventListener('keydown', focusSearch);
    return () => {
      window.removeEventListener('keydown', focusSearch);
      if (focusFrameRef.current) window.cancelAnimationFrame(focusFrameRef.current);
    };
  }, [entered]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useLayoutEffect(() => {
    if (previousPageRef.current === activePage) return;
    previousPageRef.current = activePage;
    if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
    setMainScrolled(false);
  }, [activePage]);

  const counts = useMemo(() => ({
    drugs: data.drugs.length,
    disorders: data.disorders.length,
    cases: data.cases.length,
    resources: data.resources.length
  }), [data]);

  const searchResults = useMemo(() => matchKnowledge(query, data), [data, query]);

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
    pendingStorageToastRef.current = '已保存到本地浏览器';
    setData((current) => {
      const list = current[type] || [];
      const found = list.some((item) => item.id === nextItem.id);
      return { ...current, [type]: found ? list.map((item) => item.id === nextItem.id ? nextItem : item) : [nextItem, ...list] };
    });
    setSelected(nextItem);
    setEditor(null);
  }

  function deleteItem(type, item) {
    if (!window.confirm('确定删除“' + (item.name || item.title) + '”吗？')) return;
    pendingStorageToastRef.current = '词条已删除';
    setData((current) => ({ ...current, [type]: current[type].filter((entry) => entry.id !== item.id) }));
    setSelected(null);
  }

  const activeNavIndex = Math.max(0, navItems.findIndex((item) => item.id === activePage));
  const activePageLabel = navItems.find((item) => item.id === activePage)?.label || '首页';
  const appView = (
    <div
      className="app-shell"
      data-page={activePage}
      data-scrolled={mainScrolled ? 'true' : 'false'}
      data-mobile-nav={mobileNav ? 'open' : 'closed'}
    >
      <header className="topbar">
        <button className="brand mobile-brand" onClick={() => go('home')} aria-label="Sym Gen 心鉴，回到首页">
          <span className="brand-mark"><img src={symGenMark} alt="" /></span>
          <span><strong>Sym Gen</strong><em>{activePageLabel}</em></span>
        </button>
        <div className="topbar-actions">
          <button className="icon-button menu-toggle" onClick={() => setMobileNav(!mobileNav)} aria-label="打开导航"><Menu size={20} /></button>
        </div>
      </header>

      <div className="layout">
        <aside className={'sidebar ' + (mobileNav ? 'is-open' : '')}>
          <div className="side-brand-block">
            <button className="brand side-brand" onClick={() => go('home')} aria-label="Sym Gen 心鉴，回到首页">
              <span className="brand-mark"><img src={symGenMark} alt="" /></span>
              <span><strong>Sym Gen</strong><em>心鉴 · WIKI</em></span>
            </button>
            <span className="side-coordinate">SG / 00</span>
          </div>
          <div className="side-intro"><span className="eyebrow">OPEN KNOWLEDGE ROOM</span><p>给每一种感受<br />一份可靠的解释</p></div>
          <nav
            className="main-nav"
            aria-label="主导航"
            style={{ '--active-index': activeNavIndex }}
          >
            <span className="nav-indicator" aria-hidden="true" />
            {navItems.map((item, itemIndex) => <button key={item.id} style={{ '--nav-order': itemIndex }} className={activePage === item.id ? 'active' : ''} onClick={() => go(item.id)}><NavIcon id={item.id} /><span>{item.label}</span>{item.id !== 'home' && <small>{counts[item.id]}</small>}<ChevronRight size={15} /></button>)}
          </nav>
          <div className="side-bottom">
            <span className="status-dot"><i /> {CAN_EDIT ? '本地编辑模式' : '公开阅读模式'}</span>
            <div className="side-foot"><ShieldCheck size={15} /><span>内容用于公共科普<br />不替代专业诊疗</span></div>
            <span className="side-version">SYM GEN / LOCAL 0.2</span>
          </div>
        </aside>
        <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航" tabIndex={mobileNav ? 0 : -1} />

        <main
          className="main-content"
          ref={mainContentRef}
          onScroll={(event) => {
            const scrolled = event.currentTarget.scrollTop > 8;
            setMainScrolled((current) => current === scrolled ? current : scrolled);
          }}
        >
          <AnimatedPresence
            viewKey={activePage}
            kind="page"
            mode="wait"
            exitMs={150}
            enterMs={440}
            settleMs={activePage === 'cases' ? 620 : 760}
            resolveDirection={resolvePageDirection}
          >
            {activePage === 'home' && <HomePage data={data} counts={counts} onNavigate={go} onOpen={openItem} query={query} setQuery={setQuery} searchResults={searchResults} searchInputRef={searchInputRef} />}
            {activePage === 'drugs' && <ListPage type="drugs" data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} mainContentRef={mainContentRef} />}
            {activePage === 'disorders' && <ListPage type="disorders" data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} mainContentRef={mainContentRef} />}
            {activePage === 'cases' && <CasesPage data={data} selected={selected} onSelect={setSelected} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} onOpenDisorder={(disorder) => openItem('disorders', disorder)} mainContentRef={mainContentRef} />}
            {activePage === 'resources' && <ResourcesPage data={data} onEdit={startEdit} onDelete={deleteItem} onAdd={startEdit} />}
          </AnimatedPresence>
        </main>
      </div>

      <AnimatedPresence
        viewKey={CAN_EDIT && editor ? `${editor.type}:${editor.item.id}` : EMPTY_VIEW}
        emptyKey={EMPTY_VIEW}
        kind="overlay"
        exitMs={150}
        enterMs={320}
        resolveDirection={resolveOverlayDirection}
      >
        {CAN_EDIT && editor && <EditorModal editor={editor} disorders={data.disorders} onClose={() => setEditor(null)} onSave={saveEditor} />}
      </AnimatedPresence>
      <AnimatedPresence
        viewKey={(storageError || toast) || EMPTY_VIEW}
        emptyKey={EMPTY_VIEW}
        kind="toast"
        exitMs={160}
        enterMs={300}
        resolveDirection={resolveOverlayDirection}
      >
        {(storageError || toast) && <div className="toast" role="status">{storageError ? <CircleHelp size={16} /> : <Sparkles size={16} />}{storageError || toast}</div>}
      </AnimatedPresence>
    </div>
  );

  return (
    <AnimatedPresence
      viewKey={entered ? 'application' : 'welcome'}
      kind="gateway"
      exitMs={180}
      enterMs={480}
      settleMs={850}
      resolveDirection={resolveForwardDirection}
    >
      {entered ? appView : <WelcomeScreen onEnter={() => setEntered(true)} />}
    </AnimatedPresence>
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

function HomePage({ data, counts, onNavigate, onOpen, query, setQuery, searchResults, searchInputRef }) {
  return <div className="page home-page page-enter">
    <section className="hero">
      <div className="hero-image" aria-hidden="true" />
      <div className="hero-overlay" />
      <div className="hero-grid-markers" aria-hidden="true"><span>00</span><span>12</span><span>GEN</span></div>
      <div className="hero-content">
        <span className="eyebrow light">SYM GEN · OPEN KNOWLEDGE BASE</span>
        <div className="hero-title">
          <KineticTitle as="h1" text="Sym Gen" mode="converge" replayKey="home" />
          <span>心鉴 · 精神与心理健康科普</span>
        </div>
        <p>把复杂的精神健康知识，整理成可以查阅、共同维护的公开词条。</p>
        <div className="hero-meta"><span><i className="live-mark" /> 内容持续整理中</span><span>更新于 2026.07</span></div>
      </div>
      <KnowledgeIndexGraphic counts={counts} onNavigate={onNavigate} />
      <div className="hero-note"><CircleHelp size={15} /><span>面向公众的阅读版<br />不替代医生的诊断与处方</span></div>
    </section>

    <section className="reader-note">
      <span className="editorial-number" aria-hidden="true">01</span>
      <div className="reader-heading"><span className="eyebrow">致读者</span><h2>先描述发生了什么，再看可能相关的线索。</h2></div>
      <p className="reader-copy">把你的感受、持续时间、睡眠变化和对生活的影响写下来。心鉴会先整理疾病线索与相似案例，再展示关联的治疗和药物资料；结果不是诊断，也不能替代面对面的专业评估。</p>
      <span className="reader-coordinate" aria-hidden="true">READER NOTE / 01</span>
    </section>

    <DescriptionSearch query={query} setQuery={setQuery} results={searchResults} onOpen={onOpen} searchInputRef={searchInputRef} />

    <section className="collection-block">
      <div className="section-heading"><span className="editorial-section-number" aria-hidden="true">03</span><div><span className="eyebrow">知识入口</span><h2>从这里继续阅读</h2></div><span className="section-index">03 / 05</span></div>
      <div className="entry-list">
        <EntryRow index="01" title="精神药物" text="作用、动力学、联用与禁忌，按分类快速查看。" count={counts.drugs + ' 个词条'} onClick={() => onNavigate('drugs')} accent="blue" icon={<FlaskConical size={19} />} />
        <EntryRow index="02" title="疾病科普" text="从症状、病程与功能影响理解常见精神障碍。" count={counts.disorders + ' 个词条'} onClick={() => onNavigate('disorders')} accent="yellow" icon={<HeartPulse size={19} />} />
        <EntryRow index="03" title="案例分析" text="按疾病分类的案例单元，练习评估与沟通思路。" count={counts.cases + ' 个案例'} onClick={() => onNavigate('cases')} accent="ink" icon={<FileText size={19} />} />
        <EntryRow index="04" title="网络资源" text="可靠的网站与开放资料入口，离开本站前往查看。" count={counts.resources + ' 项资源'} onClick={() => onNavigate('resources')} accent="teal" icon={<BookOpen size={19} />} />
      </div>
    </section>

    <footer className="home-footer"><span>Sym Gen 心鉴 / 一个可共同维护的公益资料室</span><span>资料版本 0.2 · 本地优先</span></footer>
  </div>;
}

function EntryRow({ index, title, text, count, onClick, accent, icon }) {
  return <button className={'entry-row accent-' + accent} onClick={onClick}><span className="entry-axis" aria-hidden="true" /><span className={'entry-icon ' + accent}>{icon}</span><span className="entry-index">{index}</span><span className="entry-copy"><strong>{title}</strong><small>{text}</small></span><span className="entry-count">{count}</span><ArrowUpRight className="entry-arrow" size={18} /></button>;
}

function DescriptionSearch({ query, setQuery, results, onOpen, searchInputRef }) {
  const hasKnowledge = results.disorders.length || results.cases.length || results.drugs.length;
  return <section className="search-block description-search">
    <div className="search-meta">
      <span className="editorial-number" aria-hidden="true">02</span>
      <div><span className="eyebrow">描述式检索</span><h2>把正在经历的情况写下来</h2><p>用自然语言整理症状、时间与生活影响。</p></div>
      <span className="section-index">02 / 05</span>
    </div>
    <div className="search-dock">
      <div className="search-wrap"><Search size={19} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：三个月都很累，早醒，不想见人" aria-label="描述你正在经历的情况" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="清除描述"><X size={16} /></button>}<kbd>Ctrl/⌘ K</kbd></div>
      <div className="search-dock-status" aria-hidden="true"><span>NATURAL LANGUAGE</span><span>LOCAL KNOWLEDGE INDEX</span></div>
      {query && <div className="search-results search-results-rich">
        {results.risk && <div className={'risk-banner ' + results.risk.level}><ShieldCheck size={18} /><div><strong>{results.risk.labels.join(' · ')}</strong><p>{results.risk.message}</p></div></div>}
        {results.disorders.length > 0 && <SearchGroup label="可能相关的疾病线索" note="按症状、时间线和功能影响排序"><div className="search-result-list">{results.disorders.map(({ item, hits }) => <SearchResult key={'disorder-' + item.id} type="disorders" item={item} hits={hits} onOpen={onOpen} />)}</div></SearchGroup>}
        {results.cases.length > 0 && <SearchGroup label="相似案例" note="用于理解评估重点，不代表与你相同"><div className="search-result-list">{results.cases.map(({ item, hits }) => <SearchResult key={'case-' + item.id} type="cases" item={item} hits={hits} onOpen={onOpen} />)}</div></SearchGroup>}
        {results.drugs.length > 0 && <SearchGroup label="关联治疗与药物资料" note="来自已匹配的疾病线索，仅供阅读"><div className="search-result-list">{results.drugs.map((item) => <SearchResult key={'drug-' + item.id} type="drugs" item={item} hits={[item.categoryLabel]} onOpen={onOpen} />)}</div></SearchGroup>}
        {results.directDrugHint && <div className="search-hint"><FlaskConical size={16} /><span>你输入了药物名称。心鉴先从疾病和案例解释它可能出现的治疗语境；完整药物分类请打开“药物”目录查看。</span></div>}
        {!hasKnowledge && !results.risk && !results.directDrugHint && <div className="empty-search">暂时没有足够的匹配线索。可以补充持续多久、睡眠/精力变化，以及对工作或关系的影响。</div>}
      </div>}
    </div>
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

function ListPage({ type, data, selected, onSelect, onEdit, onDelete, onAdd, mainContentRef }) {
  const detailRef = useRef(null);
  const indexPanelRef = useRef(null);
  const mobileListScrollRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const items = data[type];
  const label = type === 'drugs' ? '精神药物' : '疾病科普';

  const isMobileLayout = () => window.matchMedia('(max-width: 780px)').matches;

  function selectItem(item) {
    if (!selected && isMobileLayout()) mobileListScrollRef.current = mainContentRef.current?.scrollTop || 0;
    onSelect(item);
  }

  function closeDetail() {
    const shouldRestore = isMobileLayout();
    onSelect(null);
    if (!shouldRestore) return;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: mobileListScrollRef.current, behavior: 'auto' });
      scrollFrameRef.current = null;
    });
  }

  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() => {
      indexPanelRef.current?.querySelector('.index-list button.selected')?.scrollIntoView({ block: 'nearest' });
      if (isMobileLayout()) detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  return <div className="page library-page page-enter">
    <PageHeader page={type} eyebrow={type === 'drugs' ? 'MEDICATIONS' : 'DISORDERS'} title={label} description={type === 'drugs' ? '按《精神药物手册》的章节与药理学分类整理常见精神科药物。' : '从症状、病程与功能影响出发，建立可读的疾病词条。'} count={items.length + ' 个词条'} onAdd={() => onAdd(type)} addLabel="新增词条" />
    <div className="workspace-grid">
      <section className={'index-panel ' + (type === 'drugs' ? 'drug-index-panel' : 'disorder-index-panel')} ref={indexPanelRef}><div className="panel-label"><span>分类索引</span><span>{String(items.length).padStart(2, '0')} / INDEX</span></div>{type === 'drugs' ? <DrugIndex items={items} selected={selected} onSelect={selectItem} /> : <DisorderIndex items={items} selected={selected} onSelect={selectItem} />}</section>
      <span className="workspace-rail" aria-hidden="true"><i /></span>
      <section className={'detail-panel ' + (selected ? 'has-selection' : 'is-empty')} ref={detailRef}>
        <span className="detail-panel-coordinate" aria-hidden="true">{selected ? 'ENTRY / OPEN' : 'ENTRY / AWAIT'}</span>
        <AnimatedPresence
          viewKey={selected?.id || EMPTY_VIEW}
          kind="detail"
          exitMs={145}
          enterMs={360}
          settleMs={620}
          resolveDirection={resolveDetailDirection}
        >
          {selected
            ? <Detail type={type} item={selected} onBack={closeDetail} onEdit={() => onEdit(type, selected)} onDelete={() => onDelete(type, selected)} />
            : <EmptyDetail type={type} onChoose={() => items[0] && selectItem(items[0])} />}
        </AnimatedPresence>
      </section>
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
  return <div className="disorder-index">{groups.map((group, groupIndex) => <section className="disorder-category" style={{ '--group-index': Math.min(groupIndex, 7) }} key={group.name}><div className="disorder-category-head"><span className="group-number">{String(groupIndex + 1).padStart(2, '0')}</span><strong>{group.name}</strong><small>{group.items.length}</small></div><div className="index-list">{group.items.map((item) => <button key={item.id} className={selected?.id === item.id ? 'selected' : ''} onClick={() => onSelect(item)}><span>{item.name}</span><small>{item.aliases?.join(' · ')}</small><ChevronRight size={15} /></button>)}</div></section>)}</div>;
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
  return <div className="drug-index">{sections.map((section, sectionIndex) => <section className="drug-section" style={{ '--group-index': Math.min(sectionIndex, 7) }} key={section.name}><div className="drug-section-head"><span className="group-number">{String(sectionIndex + 1).padStart(2, '0')}</span><strong>{section.name}</strong><span>{section.categories.reduce((total, category) => total + category.items.length, 0)} 个词条</span></div>{section.categories.map((category) => <div className="drug-category" key={category.name}><div className="drug-category-head"><div><strong>{category.name}</strong>{category.description && category.description !== category.name && <span>{category.description}</span>}</div><small>{category.items.length}</small></div><div className="index-list">{category.items.map((item) => <button key={item.id} className={selected?.id === item.id ? 'selected' : ''} onClick={() => onSelect(item)}><span>{item.name}</span><small>{item.aliases}</small><ChevronRight size={15} /></button>)}</div></div>)}</section>)}</div>;
}

function Detail({ type, item, onBack, onEdit, onDelete }) {
  const isDrug = type === 'drugs';
  const aliasText = Array.isArray(item.aliases) ? item.aliases.join(' · ') : item.aliases || '';
  const latinName = aliasText.split(/\s*[·•]\s*/).find((part) => /[A-Za-z]/.test(part)) || item.name;
  return <article className="detail-article"><button className="detail-back" onClick={onBack}><ArrowLeft size={15} /> 返回列表</button><div className="detail-top"><span className={'detail-entry-number ' + (isDrug ? 'detail-entry-name' : '')} lang={isDrug ? 'en' : undefined} aria-hidden="true">{isDrug ? latinName : 'ENTRY'}</span><div><span className="eyebrow">{isDrug ? (item.categoryLabel || item.className) : item.category}</span><h2>{item.name}</h2><p className="aliases">{isDrug ? item.aliases : item.aliases?.join(' · ') || '疾病词条 · 公共阅读版'}</p>{isDrug && item.className && item.className !== item.categoryLabel && <p className="detail-class">{item.className}</p>}</div>{CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑词条"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除词条"><Trash2 size={17} /></button></div>}</div>{isDrug ? <div className="fact-grid"><Fact label="适用情境" text={item.indication} priority /><Fact label="药物作用" text={item.action} priority /><Fact label="药物动力学" text={item.kinetics} /><Fact label="药物联用效果" text={item.interactions} /><Fact label="禁忌与警示" text={item.contraindications} warning /></div> : <DiseaseFacts item={item} />}<SourceLine text={item.source} /></article>;
}

function DiseaseFacts({ item }) {
  return <div className="disease-copy"><Fact label="介绍" text={item.summary} priority /><Fact label="如何理解" text={item.details} priority /><ListFact label="常见体验" items={item.symptoms} /><ListFact label="来访者可能这样描述" items={item.patientPhrases} /><ListFact label="病程线索" items={item.courseClues} /><ListFact label="可能影响" items={item.functionalImpact} /><ListFact label="评估时会关注" items={item.assessment} /><ListFact label="需要鉴别" items={item.differentials} /><ListFact label="治疗与支持概览" items={item.treatmentOverview} /><ListFact label="需要尽快求助的信号" items={item.emergencySignals} warning /></div>;
}

function Fact({ label, text, warning, priority }) { return <div className={'fact ' + (warning ? 'warning ' : '') + (priority ? 'fact-primary' : 'fact-secondary')}><span>{warning && <ShieldCheck size={14} />}{label}</span><p>{text || '待补充'}</p></div>; }
function ListFact({ label, items, warning, priority }) { return <div className={'fact fact-list ' + (warning ? 'warning ' : '') + (priority ? 'fact-primary' : 'fact-secondary')}><span>{warning && <ShieldCheck size={14} />}{label}</span>{items?.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>待补充</p>}</div>; }
function SourceLine({ text }) { return <div className="source-line"><BookOpen size={14} /><span>{text}</span></div>; }
function EmptyDetail({ type, onChoose }) { return <div className="empty-detail"><span className="empty-mark"><Brain size={25} /></span><h3>选择一个{type === 'drugs' ? '药物' : '疾病'}词条</h3><p>从左侧索引开始，查看结构化内容与来源说明。</p><button className="text-button" onClick={onChoose}>打开第一个词条 <ArrowUpRight size={15} /></button></div>; }

function CasesPage({ data, selected, onSelect, onEdit, onDelete, onAdd, onOpenDisorder, mainContentRef }) {
  const detailRef = useRef(null);
  const mobileListScrollRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const selectedDisorder = selected ? data.disorders.find((item) => item.id === selected.disorderId) : null;

  function selectCase(item) {
    if (!selected && window.matchMedia('(max-width: 780px)').matches) mobileListScrollRef.current = mainContentRef.current?.scrollTop || 0;
    onSelect(item);
  }

  function closeCase() {
    const shouldRestore = window.matchMedia('(max-width: 780px)').matches;
    onSelect(null);
    if (!shouldRestore) return;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: mobileListScrollRef.current, behavior: 'auto' });
      scrollFrameRef.current = null;
    });
  }

  useEffect(() => {
    if (!selected || !window.matchMedia('(max-width: 780px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id]);
  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);
  const { disorders, casesByDisorder } = useMemo(() => {
    const sortedDisorders = [...data.disorders].sort((a, b) => {
      const ai = DISORDER_CATEGORY_ORDER.indexOf(a.category);
      const bi = DISORDER_CATEGORY_ORDER.indexOf(b.category);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN');
    });
    const groupedCases = new Map();
    data.cases.forEach((item) => {
      const group = groupedCases.get(item.disorderId);
      if (group) group.push(item);
      else groupedCases.set(item.disorderId, [item]);
    });
    return { disorders: sortedDisorders, casesByDisorder: groupedCases };
  }, [data.cases, data.disorders]);
  return <div className="page cases-page page-enter">
    <PageHeader page="cases" eyebrow="CASE NOTES" title="案例分析" description="按疾病词条分组的教学性案例，用于练习观察、评估与沟通。" count={data.cases.length + ' 个案例'} onAdd={() => onAdd('cases')} addLabel="新增案例" />
    <AnimatedPresence viewKey={selected?.id || EMPTY_VIEW} emptyKey={EMPTY_VIEW} kind="detail" className="case-detail-presence" exitMs={145} enterMs={360} settleMs={620} resolveDirection={resolveDetailDirection}>
      {selected && <CaseDetail detailRef={detailRef} item={selected} disorder={selectedDisorder} onBack={closeCase} onEdit={() => onEdit('cases', selected)} onDelete={() => onDelete('cases', selected)} />}
    </AnimatedPresence>
    <div className="case-groups">
      {disorders.map((disorder, disorderIndex) => {
        const cases = casesByDisorder.get(disorder.id) || [];
        return <section className="case-group" key={disorder.id}>
          <span className="case-group-number" aria-hidden="true">{String(disorderIndex + 1).padStart(2, '0')}</span>
          <div className="case-group-heading"><div><span className="eyebrow">{disorder.category}</span><h2>{disorder.name}</h2></div><button className="link-button" onClick={() => onOpenDisorder(disorder)}>查看疾病词条 <ChevronRight size={15} /></button></div>
          {cases.length ? <div className="case-list">{cases.map((item) => <CaseRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={selectCase} onEdit={() => onEdit('cases', item)} onDelete={() => onDelete('cases', item)} />)}</div> : <p className="muted">还没有案例，点击右上角新增。</p>}
        </section>;
      })}
    </div>
  </div>;
}

function CaseRow({ item, selected, onSelect, onEdit, onDelete }) { return <div className={'case-row ' + (selected ? 'selected' : '')}><button onClick={() => onSelect(item)} className="case-main"><span className="case-stage">{item.stage}</span><strong>{item.title}</strong><p>{item.summary}</p><span className="tag-line">{(item.tags || []).map((tag) => <em key={tag}>{tag}</em>)}</span></button>{CAN_EDIT && <div className="row-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={16} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={16} /></button></div>}</div>; }

function CaseDetail({ item, disorder, onBack, onEdit, onDelete, detailRef }) {
  return <article className="case-detail" ref={detailRef}><button className="detail-back" onClick={onBack}><ArrowLeft size={15} /> 返回案例列表</button><div className="detail-top"><span className="detail-entry-number" aria-hidden="true">CASE</span><div><span className="eyebrow">{disorder?.category || 'CASE NOTE'} · {item.stage}</span><h2>{item.title}</h2><p className="aliases">{disorder?.name || '教学性案例'} · 合成案例</p></div>{CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={17} /></button></div>}</div><div className="fact-grid"><Fact label="案例摘要" text={item.summary} priority /><Fact label="表现" text={(item.presentation || []).join('；')} priority /><Fact label="时间线" text={item.timeline} /><Fact label="功能影响" text={item.functionImpact} /><Fact label="评估重点" text={(item.assessmentFocus || []).join('；')} /><Fact label="鉴别提示" text={(item.differentialClues || []).join('；')} /><Fact label="风险线索" text={item.riskSignals} warning /><Fact label="安全提醒" text={item.safetyNote} warning /></div><SourceLine text={item.source} /></article>;
}

function ResourcesPage({ data, onEdit, onDelete, onAdd }) { return <div className="page resources-page page-enter"><PageHeader page="resources" eyebrow="LIBRARY" title="网络资源" description="外部网站与开放资料的统一入口，原始书籍仅作为项目内部依据。" count={data.resources.length + ' 项资源'} onAdd={() => onAdd('resources')} addLabel="新增资源" /><div className="resource-list">{data.resources.map((item, itemIndex) => <article className="resource-row" key={item.id}><span className="resource-number" aria-hidden="true">{String(itemIndex + 1).padStart(2, '0')}</span><div className={'resource-kind ' + (item.kind === '书籍' ? 'yellow' : 'blue')}>{item.kind === '书籍' ? <BookOpen size={18} /> : <ExternalLink size={18} />}</div><div className="resource-copy"><span className="eyebrow">{item.source}</span><h2>{item.title}</h2><p>{item.description}</p></div><span className="resource-direction" aria-hidden="true">OUT / ↗</span><div className="row-actions"><a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label="打开资源"><ArrowUpRight size={17} /></a>{CAN_EDIT && <><button className="icon-button" onClick={() => onEdit('resources', item)} aria-label="编辑资源"><Edit3 size={16} /></button><button className="icon-button danger" onClick={() => onDelete('resources', item)} aria-label="删除资源"><Trash2 size={16} /></button></>}</div></article>)}</div><div className="resource-note"><ExternalLink size={17} /><p>这里仅展示公开网络链接。项目内部原始资料不会作为网络资源开放。</p></div></div>; }

function PageHeader({ page, eyebrow, title, description, count, onAdd, addLabel }) {
  const meta = {
    drugs: { number: '02', accent: 'cyan' },
    disorders: { number: '03', accent: 'yellow' },
    cases: { number: '04', accent: 'ink' },
    resources: { number: '05', accent: 'teal' }
  }[page] || { number: '00', accent: 'cyan' };
  return <div className={`page-header page-header-${meta.accent}`}>
    <span className="page-header-number" aria-hidden="true">{meta.number}</span>
    <div className="page-header-copy"><span className="eyebrow">{eyebrow}</span><KineticTitle as="h1" text={title} mode="converge" replayKey={title} /><p>{description}</p><span className="page-header-line" aria-hidden="true" /></div>
    <div className="page-header-actions"><span className="count-label">{count}</span>{CAN_EDIT && <button className="primary-button local-add-button" onClick={onAdd}><Plus size={16} /> {addLabel}</button>}</div>
    <span className="page-header-coordinate" aria-hidden="true">SG / {meta.number} · 122.00E</span>
  </div>;
}

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
