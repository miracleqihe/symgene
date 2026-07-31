import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowUpRight, BookOpen, Brain, ChevronDown, ChevronRight, CircleHelp, Edit3, ExternalLink,
  FileText, FlaskConical, HeartPulse, Home, Library, Menu, Plus, Search, ShieldCheck,
  Sparkles, Trash2, X
} from 'lucide-react';
import { navItems, typeLabels } from './data';
import { matchKnowledge } from './search';
import AnimatedPresence from './components/AnimatedPresence';
import FactSlider from './components/FactSlider';
import HeroLightField from './components/HeroLightField';
import KineticTitle from './components/KineticTitle';
import KnowledgeIndexGraphic from './components/KnowledgeIndexGraphic';
import PaperPlaneLetter from './components/PaperPlaneLetter';
import { useLocalKnowledge } from './hooks/useLocalKnowledge';
import symGenMark from './assets/sym-gen-heart-mark.png';
import './styles.css';

const CAN_EDIT = import.meta.env.DEV;
const DISORDER_CATEGORY_ORDER = [
  '脑器质性及躯体疾病所致精神障碍', '中毒所致精神障碍', '精神活性物质与行为成瘾所致精神障碍',
  '物质所致精神障碍', '精神分裂症及其他妄想障碍', '心境障碍', '应激相关障碍', '神经症及癔症',
  '强迫及相关障碍', '躯体症状及相关障碍', '解离障碍', '人格障碍', '性健康与性相关困扰',
  '心理生理障碍', '睡眠障碍', '儿童期心理发育障碍', '冲动控制与行为成瘾'
];
const EMPTY_VIEW = '__empty__';
const NAV_ORDER = new Map(navItems.map((item, index) => [item.id, index]));
const PAGE_META = {
  home: { number: '00', accent: 'cyan' },
  drugs: { number: '01', accent: 'cyan' },
  disorders: { number: '02', accent: 'yellow' },
  cases: { number: '03', accent: 'ink' },
  resources: { number: '04', accent: 'teal' }
};

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

function resolveOverlayDirection() {
  return 'overlay';
}

function App() {
  const [activePage, setActivePage] = useState('home');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const {
    data,
    removeEntry,
    saveEntry,
    storageError
  } = useLocalKnowledge({ onSaved: setToast });
  const [mainScrolled, setMainScrolled] = useState(false);
  const [pageTransitionMode, setPageTransitionMode] = useState('menu');
  const [homeLetterOpen, setHomeLetterOpen] = useState(false);
  const mainContentRef = useRef(null);
  const previousPageRef = useRef(activePage);
  const searchInputRef = useRef(null);
  const focusFrameRef = useRef(null);
  const wheelAccumulatorRef = useRef(0);
  const wheelResetTimerRef = useRef(null);
  const wheelUnlockTimerRef = useRef(null);
  const wheelLockedRef = useRef(false);

  useEffect(() => {
    function focusSearch(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setPageTransitionMode('menu');
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
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    if (wheelResetTimerRef.current) window.clearTimeout(wheelResetTimerRef.current);
    if (wheelUnlockTimerRef.current) window.clearTimeout(wheelUnlockTimerRef.current);
  }, []);

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

  function go(page, source = 'menu') {
    setPageTransitionMode(source);
    setActivePage(page);
    setSelected(null);
    setQuery('');
    setMobileNav(false);
    if (page !== 'home') setHomeLetterOpen(false);
  }

  function openItem(type, item) {
    setPageTransitionMode('menu');
    setActivePage(type);
    setSelected(item);
    setQuery('');
    setMobileNav(false);
  }

  function startEdit(type, item = null) {
    setEditor({ type, item: item ? { ...item } : makeBlank(type) });
  }

  function makeBlank(type) {
    if (type === 'drugs') return { id: 'drug-' + Date.now(), name: '', aliases: '', className: '待补充分类', indication: '', action: '', kinetics: '', interactions: '', sideEffects: '', contraindications: '', source: '待补充来源', updated: new Date().toISOString().slice(0, 10) };
    if (type === 'disorders') return { id: 'disorder-' + Date.now(), name: '', aliases: [], category: '待分类', summary: '', details: '', symptoms: [], patientPhrases: [], courseClues: [], functionalImpact: [], assessment: [], differentials: [], treatmentOverview: [], emergencySignals: [], relatedDrugIds: [], source: '待补充来源' };
    if (type === 'cases') return { id: 'case-' + Date.now(), disorderId: data.disorders[0]?.id || '', title: '', stage: '待整理', tags: [], summary: '', presentation: [], timeline: '', functionImpact: '', riskSignals: '', assessmentFocus: [], differentialClues: [], safetyNote: '', source: '待补充来源' };
    return { id: 'resource-' + Date.now(), kind: '网站', title: '', description: '', url: '', source: '' };
  }

  function saveEditor(nextItem) {
    const type = editor.type;
    if (!saveEntry(type, nextItem)) return;
    setSelected(nextItem);
    setEditor(null);
  }

  function deleteItem(type, item) {
    if (!window.confirm('确定删除“' + (item.name || item.title) + '”吗？')) return;
    if (!removeEntry(type, item.id)) return;
    setSelected(null);
  }

  function canContinueScrolling(element, deltaY) {
    if (!element) return false;
    const overflowY = window.getComputedStyle(element).overflowY;
    if (!['auto', 'scroll', 'overlay'].includes(overflowY)) return false;
    if (element.scrollHeight <= element.clientHeight + 2) return false;
    if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 2;
    return element.scrollTop > 2;
  }

  function handlePageWheel(event) {
    if (editor || mobileNav || homeLetterOpen || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || Math.abs(event.deltaY) < 1) return;
    if (event.target?.closest?.('input, textarea, select, [role="dialog"], .search-results')) return;
    if (activePage === 'drugs' && selected) {
      wheelAccumulatorRef.current = 0;
      return;
    }

    let scrollNode = event.target;
    while (scrollNode && scrollNode !== event.currentTarget) {
      if (canContinueScrolling(scrollNode, event.deltaY)) return;
      scrollNode = scrollNode.parentElement;
    }
    if (canContinueScrolling(event.currentTarget, event.deltaY)) return;

    if (wheelLockedRef.current) {
      event.preventDefault();
      return;
    }

    const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    wheelAccumulatorRef.current += Math.max(-90, Math.min(90, normalizedDelta));
    if (wheelResetTimerRef.current) window.clearTimeout(wheelResetTimerRef.current);
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelAccumulatorRef.current = 0;
    }, 150);

    if (Math.abs(wheelAccumulatorRef.current) < 64) return;

    const direction = wheelAccumulatorRef.current > 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(navItems.length - 1, activeNavIndex + direction));
    wheelAccumulatorRef.current = 0;
    if (nextIndex === activeNavIndex) return;

    event.preventDefault();
    wheelLockedRef.current = true;
    go(navItems[nextIndex].id, 'wheel');
    if (wheelUnlockTimerRef.current) window.clearTimeout(wheelUnlockTimerRef.current);
    wheelUnlockTimerRef.current = window.setTimeout(() => {
      wheelLockedRef.current = false;
    }, 680);
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
              <span><strong>Sym Gen</strong><em>精神与心理健康科普</em></span>
            </button>
          </div>
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
            <div className="side-foot"><ShieldCheck size={15} /><span>仅供公共科普，不替代专业诊疗</span></div>
          </div>
        </aside>
        <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航" tabIndex={mobileNav ? 0 : -1} />

        <main
          className={'main-content ' + (activePage === 'home' ? 'home-main-content' : '')}
          ref={mainContentRef}
          onWheel={handlePageWheel}
          onScroll={(event) => {
            const scrolled = event.currentTarget.scrollTop > 8;
            setMainScrolled((current) => current === scrolled ? current : scrolled);
          }}
        >
          <AnimatedPresence
            viewKey={activePage}
            kind="page"
            className={pageTransitionMode === 'wheel' ? 'page-scroll-presence' : ''}
            mode="wait"
            exitMs={activePage === 'home' ? 220 : (pageTransitionMode === 'wheel' ? 170 : 150)}
            enterMs={pageTransitionMode === 'wheel' ? 430 : 440}
            settleMs={pageTransitionMode === 'wheel' ? 470 : (activePage === 'cases' ? 520 : 580)}
            resolveDirection={resolvePageDirection}
          >
            {activePage === 'home' && <HomePage counts={counts} onNavigate={go} onOpen={openItem} query={query} setQuery={setQuery} searchResults={searchResults} searchInputRef={searchInputRef} onLetterOpenChange={setHomeLetterOpen} />}
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

  return appView;
}

function NavIcon({ id }) {
  const props = { size: 17, strokeWidth: 1.9 };
  if (id === 'home') return <Home {...props} />;
  if (id === 'drugs') return <FlaskConical {...props} />;
  if (id === 'disorders') return <HeartPulse {...props} />;
  if (id === 'cases') return <FileText {...props} />;
  return <Library {...props} />;
}

function HomePage({ onNavigate, onOpen, query, setQuery, searchResults, searchInputRef, onLetterOpenChange }) {
  return <div className="page home-page page-enter">
    <section className="home-hero">
      <header className="home-topbar">
        <button className="home-brand" onClick={() => onNavigate('home')} aria-label="Sym Gen 心鉴，回到首页">
          <span className="brand-mark"><img src={symGenMark} alt="" /></span>
          <span><strong>Sym Gen</strong><small>心鉴</small></span>
        </button>
        <KnowledgeIndexGraphic onNavigate={onNavigate} />
      </header>
      <HeroLightField />
      <div className="home-hero-grid">
        <div className="home-hero-cluster">
          <div className="home-hero-copy">
            <span className="eyebrow">公益精神健康知识库</span>
            <div className="hero-title">
              <KineticTitle as="h1" text="Sym Gen" mode="converge" replayKey="home" />
              <span>心鉴 · 精神与心理健康科普</span>
            </div>
            <p>以同理为镜，照见世间每一寸柔软</p>
          </div>
          <PaperPlaneLetter onOpenChange={onLetterOpenChange} />
          <DescriptionSearch query={query} setQuery={setQuery} results={searchResults} onOpen={onOpen} searchInputRef={searchInputRef} />
        </div>
      </div>
      <button className="home-scroll-cue" type="button" onClick={() => onNavigate('drugs', 'wheel')} aria-label="向下浏览药物页面">
        <ChevronDown aria-hidden="true" />
      </button>
      <p className="home-disclaimer"><ShieldCheck size={15} />本站仅供信息参考，不替代医生的诊断与处方。</p>
    </section>
  </div>;
}

function DescriptionSearch({ query, setQuery, results, onOpen, searchInputRef }) {
  const hasKnowledge = results.disorders.length || results.cases.length || results.drugs.length;
  return <section className="description-search">
    <div className="search-dock">
      <div className="search-wrap"><Search size={19} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：三个月都很累，早醒，不想见人" aria-label="描述你正在经历的情况" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="清除描述"><X size={16} /></button>}<kbd>Ctrl/⌘ K</kbd></div>
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
      <section className={'index-panel ' + (type === 'drugs' ? 'drug-index-panel' : 'disorder-index-panel')} ref={indexPanelRef}>
        <div className="panel-label">
          <strong>分类索引</strong>
          <span><strong>{items.length}</strong><small>条目</small></span>
        </div>
        {type === 'drugs' ? <DrugIndex items={items} selected={selected} onSelect={selectItem} /> : <DisorderIndex items={items} selected={selected} onSelect={selectItem} />}
      </section>
      <span className="workspace-rail" aria-hidden="true"><i /></span>
      <section className={'detail-panel ' + (selected ? 'has-selection' : 'is-empty')} ref={detailRef}>
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
  const drugFacts = isDrug ? [
    { label: '适用情境', text: item.indication, tone: 'sky' },
    { label: '药物作用', text: item.action, tone: 'sand' },
    { label: '药物动力学', text: item.kinetics, tone: 'mint' },
    { label: '药物联用', text: item.interactions, tone: 'blend' },
    { label: '副作用', text: item.sideEffects, tone: 'clay' }
  ] : [];
  return <article className="detail-article">
    <div className="detail-toolbar">
      <button className="detail-back" onClick={onBack}><ArrowLeft size={15} /> 返回列表</button>
      {CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑词条"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除词条"><Trash2 size={17} /></button></div>}
    </div>
    <div className="detail-top">
      <div><span className="eyebrow">{isDrug ? (item.categoryLabel || item.className) : item.category}</span><h2>{item.name}</h2><p className="aliases">{isDrug ? item.aliases : item.aliases?.join(' · ') || '疾病词条 · 公共阅读版'}</p>{isDrug && item.className && item.className !== item.categoryLabel && <p className="detail-class">{item.className}</p>}</div>
    </div>
    {isDrug ? <><Fact label="禁忌与警示" text={item.contraindications} warning priority /><FactSlider items={drugFacts} label={`${item.name}核心信息`} /></> : <DiseaseFacts item={item} />}
    <SourceLine text={item.source} />
  </article>;
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
      {disorders.map((disorder) => {
        const cases = casesByDisorder.get(disorder.id) || [];
        return <section className="case-group" key={disorder.id}>
          <div className="case-group-heading"><div><span>{disorder.category}</span><h2>{disorder.name}</h2></div><button className="link-button" onClick={() => onOpenDisorder(disorder)}>查看疾病词条 <ChevronRight size={15} /></button></div>
          {cases.length ? <div className="case-list">{cases.map((item) => <CaseRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={selectCase} onEdit={() => onEdit('cases', item)} onDelete={() => onDelete('cases', item)} />)}</div> : <p className="muted">还没有案例，点击右上角新增。</p>}
        </section>;
      })}
    </div>
  </div>;
}

function CaseRow({ item, selected, onSelect, onEdit, onDelete }) {
  return <div className={'case-row ' + (selected ? 'selected' : '')}>
    <button onClick={() => onSelect(item)} className="case-main">
      <span className="case-stage">{item.stage}</span>
      <strong>{item.title}</strong>
      <p>{item.summary}</p>
      <span className="tag-line">{(item.tags || []).map((tag) => <em key={tag}>{tag}</em>)}</span>
    </button>
    {CAN_EDIT && <div className="row-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={16} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={16} /></button></div>}
  </div>;
}

function CaseDetail({ item, disorder, onBack, onEdit, onDelete, detailRef }) {
  return <article className="case-detail" ref={detailRef}><button className="detail-back" onClick={onBack}><ArrowLeft size={15} /> 返回案例列表</button><div className="detail-top"><span className="detail-entry-number" aria-hidden="true">CASE</span><div><span className="eyebrow">{disorder?.category || 'CASE NOTE'} · {item.stage}</span><h2>{item.title}</h2><p className="aliases">{disorder?.name || '教学性案例'} · 合成案例</p></div>{CAN_EDIT && <div className="detail-actions"><button className="icon-button" onClick={onEdit} aria-label="编辑案例"><Edit3 size={17} /></button><button className="icon-button danger" onClick={onDelete} aria-label="删除案例"><Trash2 size={17} /></button></div>}</div><div className="fact-grid"><Fact label="案例摘要" text={item.summary} priority /><Fact label="表现" text={(item.presentation || []).join('；')} priority /><Fact label="时间线" text={item.timeline} /><Fact label="功能影响" text={item.functionImpact} /><Fact label="评估重点" text={(item.assessmentFocus || []).join('；')} /><Fact label="鉴别提示" text={(item.differentialClues || []).join('；')} /><Fact label="风险线索" text={item.riskSignals} warning /><Fact label="安全提醒" text={item.safetyNote} warning /></div><SourceLine text={item.source} /></article>;
}

function ResourcesPage({ data, onEdit, onDelete, onAdd }) {
  return <div className="page resources-page page-enter">
    <PageHeader page="resources" eyebrow="LIBRARY" title="网络资源" description="外部网站与开放资料的统一入口，原始书籍仅作为项目内部依据。" count={data.resources.length + ' 项资源'} onAdd={() => onAdd('resources')} addLabel="新增资源" />
    <div className="resource-list">
      {data.resources.map((item) => <article className="resource-row" key={item.id}>
        <div className="resource-copy"><span className="eyebrow">{item.source}</span><h2>{item.title}</h2><p>{item.description}</p></div>
        <div className="resource-card-foot"><a className="resource-open" href={item.url} target="_blank" rel="noreferrer">打开资源 <ArrowUpRight size={16} /></a>{CAN_EDIT && <div className="row-actions"><button className="icon-button" onClick={() => onEdit('resources', item)} aria-label="编辑资源"><Edit3 size={16} /></button><button className="icon-button danger" onClick={() => onDelete('resources', item)} aria-label="删除资源"><Trash2 size={16} /></button></div>}</div>
      </article>)}
    </div>
    <div className="resource-note"><ExternalLink size={17} /><p>这里仅展示公开网络链接。项目内部原始资料不会作为网络资源开放。</p></div>
  </div>;
}

function PageHeader({ page, eyebrow, title, description, count, onAdd, addLabel }) {
  const meta = PAGE_META[page] || PAGE_META.home;
  return <header className={`page-header page-header-${meta.accent}`}>
    <div className="page-title-group"><span className="page-kicker">{meta.number} · {eyebrow}</span><KineticTitle as="h1" text={title} mode="converge" replayKey={title} /><p>{description}</p></div>
    <div className="page-actions"><span className="count-label">{count}</span>{CAN_EDIT && <button className="primary-button local-add-button" onClick={onAdd}><Plus size={16} /> {addLabel}</button>}</div>
  </header>;
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
    {type === 'drugs' && <>{field('名称', 'name')}{field('别名', 'aliases')}{field('章节', 'section')}{field('子分类', 'categoryLabel')}{field('分类全称', 'className', { wide: true })}{field('适用情境', 'indication', { textarea: true, wide: true })}{field('药物作用', 'action', { textarea: true, wide: true })}{field('药物动力学', 'kinetics', { textarea: true, wide: true })}{field('药物联用效果', 'interactions', { textarea: true, wide: true })}{field('副作用', 'sideEffects', { textarea: true, wide: true })}{field('禁忌与警示', 'contraindications', { textarea: true, wide: true })}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'disorders' && <>{field('名称', 'name')}{field('分类', 'category')}{listField('别名（每行一项）', 'aliases')}{field('一句话介绍', 'summary', { textarea: true, wide: true })}{field('如何理解', 'details', { textarea: true, wide: true })}{listField('常见体验', 'symptoms')}{listField('来访者可能这样描述', 'patientPhrases')}{listField('病程线索', 'courseClues')}{listField('可能影响', 'functionalImpact')}{listField('评估时会关注', 'assessment')}{listField('需要鉴别', 'differentials')}{listField('治疗与支持概览', 'treatmentOverview')}{listField('需要尽快求助的信号', 'emergencySignals')}{listField('关联药物 ID', 'relatedDrugIds')}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'cases' && <>{field('案例标题', 'title', { wide: true })}{field('所属疾病', 'disorderId', { select: disorders.map((item) => ({ value: item.id, label: item.name })) })}{field('阶段标签', 'stage')}{field('案例摘要', 'summary', { textarea: true, wide: true })}{listField('主题标签', 'tags')}{listField('表现', 'presentation')}{field('时间线', 'timeline', { textarea: true, wide: true })}{field('功能影响', 'functionImpact', { textarea: true, wide: true })}{field('风险线索', 'riskSignals', { textarea: true, wide: true })}{listField('评估重点', 'assessmentFocus')}{listField('鉴别提示', 'differentialClues')}{field('安全提醒', 'safetyNote', { textarea: true, wide: true })}{field('来源说明', 'source', { textarea: true, wide: true })}</>}
    {type === 'resources' && <>{field('资源标题', 'title', { wide: true })}{field('类型', 'kind', { select: [{ value: '网站', label: '网站' }, { value: '书籍', label: '书籍' }, { value: '指南', label: '指南' }, { value: '其他', label: '其他' }] })}{field('来源', 'source')}{field('描述', 'description', { textarea: true, wide: true })}{field('外部网址', 'url', { wide: true })}</>}
  </div><div className="modal-foot"><span><ShieldCheck size={14} /> 保存只写入本浏览器</span><div><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button"><Sparkles size={16} /> 保存词条</button></div></div></form></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
