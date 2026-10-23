import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { matchKnowledge } from '../search.js';
import { createSignedSession, createSignedStorage, SIGNED_PATH } from './t02-signed-session.js';
import './t02-consumer.css';

export function T02SignedDevelopmentApp() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let live = true;
    let current;
    let timer;
    let expiryTimer;
    let polling = false;
    const redraw = () => { if (live && current) { try { setView(current.snapshot()); } catch { current.invalidate('SIGNED_STORAGE_READ_FAILED'); setError('SIGNED_STORAGE_READ_FAILED'); setView(null); } } };
    const refresh = async () => {
      if (!current || polling) return;
      polling = true;
      try { await current.refresh(); redraw(); }
      catch { current.invalidate('SIGNED_OPERATION_FAILED'); redraw(); }
      finally { polling = false; }
    };
    const offline = () => { current?.invalidate('SIGNED_NETWORK_OFFLINE'); redraw(); };
    const visibility = () => { if (!document.hidden) { current?.invalidate(); redraw(); void refresh(); } };
    (async () => {
      try {
        const response = await fetch(`${SIGNED_PATH}configuration`, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
        if (!response.ok) throw new Error();
        const configuration = await response.json();
        if (!live) return;
        current = createSignedSession(configuration, createSignedStorage(localStorage));
        setSession(current); redraw(); await refresh();
        if (live) { timer = setInterval(refresh, 1000); expiryTimer = setInterval(redraw, 200); }
      } catch { if (live) setError('SIGNED_CONFIGURATION_REJECTED'); }
    })();
    window.addEventListener('offline', offline); window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => { live = false; clearInterval(timer); clearInterval(expiryTimer); current?.invalidate(); window.removeEventListener('offline', offline);
      window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const failClosed = (cause) => {
    const code = /^[A-Z0-9_]+$/.test(cause?.code ?? '') ? cause.code : 'SIGNED_OPERATION_FAILED';
    session?.invalidate(code); setError(code);
    try { setView(session?.snapshot() ?? null); } catch { setView(null); }
  };
  const action = (operation) => { try { operation(); setView(session.snapshot()); setError(''); } catch (cause) { failClosed(cause); } };
  const refresh = async (version, decide = false) => {
    try {
      session.invalidate('SIGNED_REFRESH_PENDING'); setView(session.snapshot());
      if (decide) await session.adopt(version);
      else await session.refresh(version);
      setView(session.snapshot()); setError('');
    } catch (cause) { failClosed(cause); }
  };
  const matches = matchKnowledge(query, view?.data ?? { drugs: [], disorders: [], cases: [], resources: [] });
  const detail = selected ? view?.data[selected.type].find((item) => item.id === selected.id) : null;
  const summary = view && { marker: view.marker, scope: view.scope, production: view.production, selected: view.selected,
    fresh: view.fresh, sequence: view.sequence, counts: view.counts, proof: view.proof, error: view.error,
    storageNamespace: view.storageNamespace, detailVisible: Boolean(detail), searchDisorders: matches.disorders.length, searchCases: matches.cases.length,
    rawCounts: Object.fromEntries(Object.entries(view.envelope?.data ?? {}).map(([type, rows]) => [type, rows.length])),
    overrideCount: Object.values(view.envelope?.localOverrides ?? {}).reduce((sum, rows) => sum + Object.keys(rows).length, 0),
    tombstoneCount: Object.values(view.envelope?.deletedIds ?? {}).reduce((sum, rows) => sum + rows.length, 0), backupCount: view.backups.length };
  return <main className="t02-development">
    <header><p className="t02-eyebrow">仅本地开发 · 全部资料虚构 · 测试身份</p><h1>签名发布消费演练</h1>
      <p>独立发布者、采用者和最新检查点经过本地网关核验。这里使用测试身份与模拟审核，不代表生产认证、真人医学审核或正式采用。</p>
      <p>生产主界面仍使用 legacy。请勿输入真实患者资料。</p></header>
    <section aria-label="签名发布状态"><h2>当前发布状态</h2>
      <p role="status">{view?.fresh ? '签名与最新检查点有效' : '当前状态无法确认，内容已隐藏'}</p>
      {view && <><label>已配置测试版本<select aria-label="已配置测试版本" value={view.selected} onChange={(event) => { void refresh(event.target.value, true); }}>
        {view.versions.map((version) => <option key={version}>{version}</option>)}</select></label>
        <button onClick={() => { void refresh(view.selected); }}>重新核验当前状态</button>
        <button onClick={() => { void refresh(view.selected, true); }}>签名采用所选测试版本</button>
        <p>撤稿序号 {view.sequence}。离线缓存只保留拒绝历史，不能授权展示内容。</p></>}
      {(error || view?.error) && <p role="alert">{error || view.error}</p>}
    </section>
    {view?.envelope && <section aria-label="签名测试隔离存储"><h2>隔离本地数据</h2><div className="t02-actions">
      <button onClick={() => action(() => session.createFictionalEdits())}>写入虚构本地编辑</button>
      <button onClick={() => action(() => session.backup())}>创建隔离备份</button>
      <button disabled={!view.backups.length} onClick={() => action(() => session.restore(view.backups[0].key))}>恢复最新隔离备份</button>
    </div></section>}
    <section><h2>浏览器本地搜索</h2><label>搜索虚构条目<input value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <ul data-testid="signed-search-results">{matches.disorders.map(({ item }) => <li key={item.id}><button onClick={() => setSelected({ type: 'disorders', id: item.id })}>{item.name}</button></li>)}{matches.cases.map(({ item }) => <li key={item.id}><button onClick={() => setSelected({ type: 'cases', id: item.id })}>{item.title}</button></li>)}</ul>
    </section>
    <div className="t02-grid">{Object.entries(view?.data ?? {}).map(([type, rows]) => <section key={type}><h2>{({ drugs: '药物', disorders: '疾病', cases: '案例', resources: '资源' })[type]} {rows.length}</h2><ul>{rows.map((item) => <li key={item.id}><button onClick={() => setSelected({ type, id: item.id })}>{item.name || item.title}</button></li>)}</ul></section>)}</div>
    <section aria-label="签名测试条目详情"><h2>详情</h2>{detail ? <article><h3>{detail.name || detail.title}</h3><p>{detail.summary || detail.description || detail.indication}</p></article> : <p>无可见详情；断网、撤稿或状态失效后隐藏旧详情。</p>}</section>
    {summary && <details><summary>演练摘要（数量与状态）</summary><pre data-testid="signed-consumer-state">{JSON.stringify(summary, null, 2)}</pre></details>}
  </main>;
}

const root = typeof document === 'undefined' ? null : document.getElementById('t02-signed-root');
if (root && import.meta.env.DEV && window.location.pathname === SIGNED_PATH) createRoot(root).render(<T02SignedDevelopmentApp/>);
