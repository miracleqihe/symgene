import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AnimatedPresence from '../components/AnimatedPresence.jsx';
import { EditorModal } from '../components/editor/EditorModal.jsx';
import { Toast } from '../components/feedback/Toast.jsx';
import { Sidebar } from '../components/layout/Sidebar.jsx';
import { LocalDataPanel } from '../components/localData/LocalDataPanel.jsx';
import { Topbar } from '../components/layout/Topbar.jsx';
import { useLocalKnowledge } from '../hooks/useLocalKnowledge.js';
import { useSearchShortcut } from '../hooks/useSearchShortcut.js';
import { CasesPage } from '../pages/CasesPage.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { LibraryPage } from '../pages/LibraryPage.jsx';
import { ResourcesPage } from '../pages/ResourcesPage.jsx';
import { WelcomePage } from '../pages/WelcomePage.jsx';
import { matchKnowledge } from '../search.js';
import { CAN_EDIT } from './constants.js';
import { createBlankEntry } from './editorDefaults.js';
import {
  EMPTY_VIEW,
  resolveForwardDirection,
  resolveOverlayDirection,
  resolvePageDirection
} from './navigation.js';

export function App({ canEdit = CAN_EDIT } = {}) {
  const [activePage, setActivePage] = useState('home');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [operationError, setOperationError] = useState('');
  const [entered, setEntered] = useState(false);
  const [localDataOpen, setLocalDataOpen] = useState(false);
  const [mainScrolled, setMainScrolled] = useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const mainContentRef = useRef(null);
  const previousPageRef = useRef(activePage);
  const searchInputRef = useRef(null);
  const {
    backups,
    data,
    envelope,
    getBackupRaw,
    importEnvelope,
    removeEntry,
    resetLocalKnowledge,
    restoreLocalBackup,
    saveEntry,
    seedData,
    storageError
  } = useLocalKnowledge({
    onSaved(message) {
      setOperationError('');
      setToast(message);
    }
  });

  useSearchShortcut({
    enabled: entered,
    onActivate() {
      setActivePage('home');
      setSelected(null);
      setMobileNav(false);
      setSearchFocusRequest((current) => current + 1);
    }
  });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!operationError) return undefined;
    const timer = window.setTimeout(() => setOperationError(''), 5000);
    return () => window.clearTimeout(timer);
  }, [operationError]);

  useEffect(() => {
    if (storageError) {
      setToast('');
      setOperationError('');
    }
  }, [storageError]);

  useLayoutEffect(() => {
    if (previousPageRef.current === activePage) return;
    previousPageRef.current = activePage;
    if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
    setMainScrolled(false);
  }, [activePage]);

  useEffect(() => {
    if (!selected) return;
    const currentItems = data[activePage];
    const currentItem = Array.isArray(currentItems)
      ? currentItems.find((item) => item.id === selected.id)
      : null;
    if (!currentItem) {
      setSelected(null);
    } else if (currentItem !== selected) {
      setSelected(currentItem);
    }
  }, [activePage, data, selected]);

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
    setEditor({ type, item: item ? { ...item } : createBlankEntry(type, data) });
  }

  function saveEditor(nextItem) {
    const type = editor.type;
    if (saveEntry(type, nextItem)) {
      setSelected(nextItem);
      setEditor(null);
    }
  }

  function deleteItem(type, item) {
    setOperationError('');
    if (type === 'disorders') {
      const relatedCases = data.cases.filter((entry) => entry.disorderId === item.id);
      if (relatedCases.length) {
        setToast('');
        setOperationError(
          `无法删除“${item.name || item.title}”：仍有 ${relatedCases.length} 个关联案例。`
          + '请先删除这些案例，或将它们改绑到其他疾病。'
        );
        return;
      }
    }
    if (!window.confirm('确定删除“' + (item.name || item.title) + '”吗？')) return;
    if (removeEntry(type, item.id)) setSelected(null);
  }

  const message = storageError || operationError || toast;
  const overlayKey = canEdit && editor
    ? `editor:${editor.type}:${editor.item.id}`
    : canEdit && localDataOpen
      ? 'local-data'
      : EMPTY_VIEW;
  const appView = (
    <div
      className="app-shell"
      data-page={activePage}
      data-scrolled={mainScrolled ? 'true' : 'false'}
      data-mobile-nav={mobileNav ? 'open' : 'closed'}
    >
      <Topbar
        activePage={activePage}
        mobileNav={mobileNav}
        onHome={() => go('home')}
        onToggleNavigation={() => setMobileNav(!mobileNav)}
      />
      <div className="layout">
        <Sidebar
          activePage={activePage}
          canEdit={canEdit}
          counts={counts}
          mobileNav={mobileNav}
          onNavigate={go}
          onOpenLocalData={() => setLocalDataOpen(true)}
        />
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="关闭导航"
          tabIndex={mobileNav ? 0 : -1}
        />
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
            {activePage === 'home' && (
              <HomePage
                counts={counts}
                onNavigate={go}
                onOpen={openItem}
                query={query}
                setQuery={setQuery}
                searchResults={searchResults}
                searchInputRef={searchInputRef}
                searchFocusRequest={searchFocusRequest}
              />
            )}
            {activePage === 'drugs' && (
              <LibraryPage
                canEdit={canEdit}
                type="drugs"
                data={data}
                selected={selected}
                onSelect={setSelected}
                onEdit={startEdit}
                onDelete={deleteItem}
                onAdd={startEdit}
                mainContentRef={mainContentRef}
              />
            )}
            {activePage === 'disorders' && (
              <LibraryPage
                canEdit={canEdit}
                type="disorders"
                data={data}
                selected={selected}
                onSelect={setSelected}
                onEdit={startEdit}
                onDelete={deleteItem}
                onAdd={startEdit}
                mainContentRef={mainContentRef}
              />
            )}
            {activePage === 'cases' && (
              <CasesPage
                canEdit={canEdit}
                data={data}
                selected={selected}
                onSelect={setSelected}
                onEdit={startEdit}
                onDelete={deleteItem}
                onAdd={startEdit}
                onOpenDisorder={(disorder) => openItem('disorders', disorder)}
                mainContentRef={mainContentRef}
              />
            )}
            {activePage === 'resources' && (
              <ResourcesPage
                canEdit={canEdit}
                data={data}
                onEdit={startEdit}
                onDelete={deleteItem}
                onAdd={startEdit}
              />
            )}
          </AnimatedPresence>
        </main>
      </div>

      <AnimatedPresence
        viewKey={overlayKey}
        emptyKey={EMPTY_VIEW}
        kind="overlay"
        exitMs={150}
        enterMs={320}
        resolveDirection={resolveOverlayDirection}
      >
        {canEdit && editor ? (
          <EditorModal
            editor={editor}
            disorders={data.disorders}
            onClose={() => setEditor(null)}
            onSave={saveEditor}
          />
        ) : canEdit && localDataOpen ? (
          <LocalDataPanel
            backups={backups}
            envelope={envelope}
            seedData={seedData}
            onClose={() => setLocalDataOpen(false)}
            onImport={importEnvelope}
            onReadBackup={getBackupRaw}
            onReset={resetLocalKnowledge}
            onRestore={restoreLocalBackup}
          />
        ) : null}
      </AnimatedPresence>
      <AnimatedPresence
        viewKey={message || EMPTY_VIEW}
        emptyKey={EMPTY_VIEW}
        kind="toast"
        exitMs={160}
        enterMs={300}
        resolveDirection={resolveOverlayDirection}
      >
        {message && (
          <Toast
            message={message}
            error={Boolean(storageError || operationError)}
          />
        )}
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
      {entered ? appView : <WelcomePage onEnter={() => setEntered(true)} />}
    </AnimatedPresence>
  );
}

export default App;
