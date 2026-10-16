import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { matchKnowledge } from '../search.js';
import { downloadTextFile } from '../storage/importExport.js';
import { createDevelopmentStorage, DEVELOPMENT_STORAGE_PREFIX } from './t02-storage.js';
import { createDevelopmentSession, readDevelopmentImportFile } from './t02-session.js';
import './t02-consumer.css';

const PATH = '/symgene/t02-dev/';
const LABELS = { drugs: '药物', disorders: '疾病', cases: '案例', resources: '资源' };
const loadVerifiedBootstrap = () => fetch(`${PATH}bootstrap`, { cache: 'no-store' }).then((response) => {
  if (!response.ok) throw Object.assign(new Error(), { code: 'DEV_BOOTSTRAP_HTTP_FAILED' });
  return response.json();
});

export function T02DevelopmentApp({ enabled = false, loadBootstrap = loadVerifiedBootstrap, nativeStorage = globalThis.localStorage } = {}) {
  const [session, setSession] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  useEffect(() => {
    if (!enabled || !import.meta.env.DEV) return;
    let live = true;
    loadBootstrap().then((bootstrap) => {
      if (!live) return;
      const next = createDevelopmentSession(bootstrap, createDevelopmentStorage(nativeStorage));
      const snapshot = next.snapshot();
      setSession(next); setView(snapshot);
    }).catch((cause) => { if (live) setError(cause.code ?? 'DEV_BOOTSTRAP_FAILED'); });
    return () => { live = false; };
  }, [enabled, loadBootstrap, nativeStorage]);

  useEffect(() => {
    if (!session) return;
    // Re-evaluate wall-clock expiry while a reader stays on an open page.
    // The local simulation is not an authenticated live retraction service.
    const timer = setInterval(() => {
      try { setView(session.snapshot()); }
      catch (cause) {
        setError(cause.code ?? 'DEV_STORAGE_READ_FAILED');
        setView((previous) => previous && ({ ...previous, fresh: false, contentFresh: false,
          data: Object.fromEntries(Object.keys(previous.data).map((type) => [type, []])),
          counts: Object.fromEntries(Object.keys(previous.counts).map((type) => [type, 0])) }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  function action(operation, success) {
    try {
      operation(); setView(session.snapshot()); setError(''); setMessage(success);
    } catch (cause) {
      session?.noteError(cause); setError(cause.code ?? 'DEV_OPERATION_FAILED');
    }
  }
  if (!enabled || !import.meta.env.DEV) return <main><h1>开发消费入口已关闭</h1></main>;
  if (!view) return <main className="t02-development"><h1>虚构内容开发演练</h1><p role="status">{error || '正在完整核验内容包…'}</p></main>;
  const matches = matchKnowledge(query, view.data);
  const details = selected ? view.data[selected.type].find((item) => item.id === selected.id) : null;
  const summary = {
    scope: view.scope, production: view.production, selected: view.selected,
    fresh: view.fresh, contentFresh: view.contentFresh, sequence: view.sequence, counts: view.counts, simulatedTimeOffsetMs: view.simulatedTimeOffsetMs,
    rawCounts: Object.fromEntries(Object.entries(view.envelope.data).map(([type, rows]) => [type, rows.length])),
    overrideCount: Object.values(view.envelope.localOverrides).reduce((sum, rows) => sum + Object.keys(rows).length, 0),
    tombstoneCount: Object.values(view.envelope.deletedIds).reduce((sum, rows) => sum + rows.length, 0),
    backupCount: view.backups.length, storageNamespace: DEVELOPMENT_STORAGE_PREFIX,
    detailVisible: Boolean(details), searchDisorders: matches.disorders.length, searchCases: matches.cases.length
  };
  return <main className="t02-development">
    <header><p className="t02-eyebrow">仅本地开发 · 全部资料虚构</p><h1>内容包消费演练</h1>
      <p>独立 React 开发应用。生产主界面仍使用 legacy；这里的审核与撤稿信任由演练控制，不代表真人签字或生产身份认证。</p>
      <p>使用独立浏览器存储前缀。请勿输入或导入真实患者资料。</p></header>
    <section aria-label="合成包与安全状态"><h2>包与安全状态</h2>
      <label>已核验合成包<select aria-label="已核验合成包" value={view.selected} onChange={(event) => action(() => session.select(event.target.value), '已切换完整合成包')}>
        {view.versions.map((version) => <option key={version}>{version}</option>)}
      </select></label>
      <p role="status">{view.fresh ? '虚构可信状态有效' : '缺少新鲜可信状态，内容已隐藏'} · 序号 {view.sequence}</p>
      <div className="t02-actions">
        <button onClick={() => action(() => session.trustSyntheticState(), '已注入虚构可信状态')}>注入虚构可信状态</button>
        <button onClick={() => action(() => session.withdrawDisorder(), '已撤回虚构疾病及依赖')}>撤回虚构疾病</button>
        <button onClick={() => action(() => session.expireSyntheticState(), '虚构时钟已推进两小时')}>模拟撤稿状态过期</button>
      </div>
    </section>
    <section aria-label="本地存储演练"><h2>隔离本地数据</h2>
      <div className="t02-actions">
        <button onClick={() => action(() => session.createFictionalEdits(), '虚构覆盖、自定义案例和删除记录已保存')}>写入虚构本地编辑</button>
        <button onClick={() => action(() => session.backup(), '已创建隔离备份')}>创建隔离备份</button>
        <button disabled={!view.backups.length} onClick={() => action(() => session.restore(view.backups[0].key), '已恢复隔离备份；撤稿仍生效')}>恢复最新隔离备份</button>
        <button onClick={() => action(() => downloadTextFile(session.exportText(), 't02-synthetic-backup.json'), '已导出虚构备份')}>导出虚构备份</button>
      </div>
      <label>导入虚构备份<input type="file" accept="application/json,.json" onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
          setPendingImport(session.previewImport(await readDevelopmentImportFile(file), file.size)); setError('');
        } catch (cause) { setPendingImport(null); setError(cause.code ?? 'DEV_IMPORT_FAILED'); }
        event.target.value = '';
      }}/></label>
      {pendingImport && <div className="t02-import-preview"><p>导入摘要：新增 {pendingImport.summary.added}、覆盖 {pendingImport.summary.overwritten}、删除记录 {pendingImport.summary.deleted}。仅写入开发命名空间。</p>
        <button onClick={() => action(() => { session.importConfirmed(pendingImport); setPendingImport(null); }, '虚构备份已导入；撤稿仍生效')}>确认导入虚构备份</button>
        <button onClick={() => setPendingImport(null)}>取消导入</button></div>}
    </section>
    {error && <p role="alert">操作未完成：{error}</p>}
    {message && <p className="t02-message" role="status">{message}</p>}
    <section aria-label="合成搜索"><h2>浏览器本地搜索</h2><label>搜索虚构条目<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入虚构疾病名称"/></label>
      {matches.risk && <p role="status">{matches.risk.message}</p>}
      <ul data-testid="search-results">{matches.disorders.map(({ item }) => <li key={item.id}><button onClick={() => setSelected({ type: 'disorders', id: item.id })}>{item.name}</button></li>)}{matches.cases.map(({ item }) => <li key={item.id}><button onClick={() => setSelected({ type: 'cases', id: item.id })}>{item.title}</button></li>)}</ul>
    </section>
    <div className="t02-grid">{Object.entries(view.data).map(([type, rows]) => <section key={type} aria-label={`虚构${LABELS[type]}目录`}><h2>{LABELS[type]} <span>{rows.length}</span></h2>
      <ul>{rows.map((item) => <li key={item.id}><button onClick={() => setSelected({ type, id: item.id })}>{item.name || item.title}</button></li>)}</ul>
    </section>)}</div>
    <section aria-label="虚构条目详情"><h2>详情</h2>{details ? <article><h3>{details.name || details.title}</h3><p>{details.summary || details.description || details.indication}</p><p>{details.source}</p><button onClick={() => setSelected(null)}>关闭详情</button></article> : <p>无可见详情；撤稿或失效后不会保留旧详情。</p>}</section>
    <details><summary>演练摘要（数量与状态）</summary><pre data-testid="consumer-state">{JSON.stringify(summary, null, 2)}</pre></details>
  </main>;
}

const root = typeof document === 'undefined' ? null : document.getElementById('t02-dev-root');
if (root && import.meta.env.DEV && window.location.pathname === PATH) createRoot(root).render(<T02DevelopmentApp enabled/>);
