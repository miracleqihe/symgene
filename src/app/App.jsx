import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorModal } from '../components/editor/EditorModal.jsx';
import { Toast } from '../components/feedback/Toast.jsx';
import { Sidebar } from '../components/layout/Sidebar.jsx';
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

export function App({ canEdit = CAN_EDIT } = {}) {
  const [activePage, setActivePage] = useState('home');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [entered, setEntered] = useState(false);
  const searchInputRef = useRef(null);
  const { data, storageError, updateData } = useLocalKnowledge({ onSaved: setToast });

  useSearchShortcut({
    enabled: entered,
    inputRef: searchInputRef,
    onActivate() {
      setActivePage('home');
      setSelected(null);
      setMobileNav(false);
    }
  });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (storageError) setToast('');
  }, [storageError]);

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
    updateData((current) => {
      const list = current[type] || [];
      const found = list.some((item) => item.id === nextItem.id);
      return {
        ...current,
        [type]: found
          ? list.map((item) => item.id === nextItem.id ? nextItem : item)
          : [nextItem, ...list]
      };
    }, '已保存到本地浏览器');
    setSelected(nextItem);
    setEditor(null);
  }

  function deleteItem(type, item) {
    if (!window.confirm('确定删除“' + (item.name || item.title) + '”吗？')) return;
    updateData(
      (current) => ({
        ...current,
        [type]: current[type].filter((entry) => entry.id !== item.id)
      }),
      '词条已删除'
    );
    setSelected(null);
  }

  if (!entered) return <WelcomePage onEnter={() => setEntered(true)} />;

  return (
    <div className="app-shell">
      <Topbar
        canEdit={canEdit}
        mobileNav={mobileNav}
        onHome={() => go('home')}
        onToggleNavigation={() => setMobileNav(!mobileNav)}
      />
      <div className="layout">
        <Sidebar
          activePage={activePage}
          counts={counts}
          mobileNav={mobileNav}
          onNavigate={go}
        />
        <main className="main-content">
          {activePage === 'home' && (
            <HomePage
              counts={counts}
              onNavigate={go}
              onOpen={openItem}
              query={query}
              setQuery={setQuery}
              searchResults={searchResults}
              searchInputRef={searchInputRef}
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
        </main>
      </div>

      {canEdit && editor && (
        <EditorModal
          editor={editor}
          disorders={data.disorders}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
      <Toast message={toast} />
      <Toast message={storageError} error />
    </div>
  );
}

export default App;
