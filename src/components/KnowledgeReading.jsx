import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Copy, Download, X } from 'lucide-react';
import { readingFor, relatedFor, teachingPrompt } from '../content/reading.js';

function saveText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PromptDialog({ prompt, name, onClose, title, description, children }) {
  const ref = useRef(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.querySelector('button')?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button,textarea,a[href]')];
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [onClose]);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setMessage('已复制，可以粘贴到你使用的 AI 中。'); }
    catch { ref.current.querySelector('textarea')?.select(); setMessage('未能自动复制。材料已选中，请按 Ctrl+C 或使用系统复制。'); }
  }
  return createPortal(<div className="reading-dialog-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="reading-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-dialog-title" ref={ref}>
      <div className="reading-dialog-head"><div><span className="eyebrow">一起读懂</span><h2 id="reading-dialog-title">{title || `${name} · 教学 Prompt`}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭教学材料"><X size={20} /></button></div>
      <p>{description || '把材料带到你熟悉的 AI 中，从自己的疑问开始。材料包含阅读链接、解释任务和使用要求。'}</p>
      <label className="sr-only" htmlFor="reading-prompt-text">完整教学材料</label>
      <textarea id="reading-prompt-text" readOnly value={prompt} spellCheck={false} />
      <p className="reading-copy-message" role="status">{message}</p>
      {children}
      <div className="reading-dialog-actions"><button className="reading-button secondary" onClick={() => saveText(prompt, `${name}-教学材料.md`)}><Download size={16} /> 下载 Markdown</button><button className="reading-button" onClick={copy}><Copy size={16} /> 复制完整材料</button></div>
    </section>
  </div>, document.body);
}

export default function KnowledgeReading({ type, item, data, onOpen, position = 'after' }) {
  const reading = readingFor(type, item);
  const related = relatedFor(type, item, data);
  const [showPrompt, setShowPrompt] = useState(false);
  const closePrompt = React.useCallback(() => setShowPrompt(false), []);
  if (position === 'before') return <section className="reading-intro" aria-label="阅读引导"><span className="eyebrow">从你的疑问开始</span><p>{reading.intro}</p><button className="reading-button" onClick={() => setShowPrompt(true)}>教学 Prompt <ArrowUpRight size={16} /></button><span className="reading-action-note">复制到你熟悉的 AI 中继续了解</span>{showPrompt && <PromptDialog prompt={teachingPrompt(type, item, data)} name={item.name || item.title} onClose={closePrompt} />}</section>;
  return <div className="knowledge-reading">
    <section className="reading-section"><h3>你可能也想问</h3><div className="reading-questions">{reading.questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    {reading.record.length > 0 && <section className="reading-section"><h3>{type === 'drugs' ? '把这些带到复诊中' : '可以慢慢整理的几件事'}</h3><ul className="reading-record">{reading.record.map(text => <li key={text}>{text}</li>)}</ul></section>}
    {reading.scenario && <section className="reading-section reading-scenario"><span className="eyebrow">虚构教学情景</span><h3>{reading.scenario.title}</h3><p>{reading.scenario.text}</p><p className="reading-scenario-note">{reading.scenario.discussion}</p></section>}
    {Object.values(related).some(items => items.length > 0) && <section className="reading-section"><h3>接着读</h3><p className="reading-caption">沿着主题了解药物和教学案例，也看看理解一个人的困扰还需要哪些背景。</p>{[['disorders','相关主题'],['drugs','治疗中的药物资料'],['cases','虚构教学案例']].map(([kind,label]) => related[kind].length > 0 && <div className="reading-related" key={kind}><h4>{label}</h4>{related[kind].map(entry => <button key={entry.id} onClick={() => onOpen?.(kind, entry)}>{entry.name || entry.title}<ArrowUpRight size={15} /></button>)}</div>)}</section>}
    <section className="reading-section"><h3>延伸阅读</h3><div className="reading-links">{reading.links.map(link => <a href={link.url} key={link.url} target="_blank" rel="noopener noreferrer"><div><strong>{link.title}</strong><span>{link.region}</span>{link.note && <p>{link.note}</p>}</div><ArrowUpRight size={17} /></a>)}</div></section>
  </div>;
}
