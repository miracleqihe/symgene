import React, { useRef, useState } from 'react';
import { ShieldCheck, Sparkles, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';

export function EditorModal({ editor, disorders, onClose, onSave }) {
  const [form, setForm] = useState(editor.item);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, onClose);
  const type = editor.type;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const parseList = (value) => Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);

  function submit(event) {
    event.preventDefault();
    const next = { ...form };
    if (type === 'disorders') {
      [
        'aliases',
        'symptoms',
        'patientPhrases',
        'courseClues',
        'functionalImpact',
        'assessment',
        'differentials',
        'treatmentOverview',
        'emergencySignals',
        'relatedDrugIds'
      ].forEach((key) => {
        next[key] = parseList(form[key]);
      });
    }
    if (type === 'cases') {
      ['tags', 'presentation', 'assessmentFocus', 'differentialClues'].forEach((key) => {
        next[key] = parseList(form[key]);
      });
    }
    onSave(next);
  }

  function field(label, key, options = {}) {
    const value = options.list && Array.isArray(form[key]) ? form[key].join('\n') : (form[key] || '');
    return (
      <label className={options.wide ? 'wide' : ''}>
        <span>{label}</span>
        {options.select ? (
          <select value={value} onChange={(event) => update(key, event.target.value)}>
            {options.select.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : options.textarea ? (
          <textarea
            rows={options.rows || 4}
            value={value}
            onChange={(event) => update(key, event.target.value)}
          />
        ) : (
          <input value={value} onChange={(event) => update(key, event.target.value)} />
        )}
      </label>
    );
  }

  const listField = (label, key) =>
    field(label, key, { textarea: true, wide: true, list: true, rows: 3 });

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label="编辑词条"
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">LOCAL EDITOR</span>
            <h2 id="editor-title">{editor.item.name || editor.item.title ? '编辑词条' : '新增词条'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {type === 'drugs' && (
              <>
                {field('名称', 'name')}
                {field('别名', 'aliases')}
                {field('章节', 'section')}
                {field('子分类', 'categoryLabel')}
                {field('分类全称', 'className', { wide: true })}
                {field('适用情境', 'indication', { textarea: true, wide: true })}
                {field('药物作用', 'action', { textarea: true, wide: true })}
                {field('药物动力学', 'kinetics', { textarea: true, wide: true })}
                {field('药物联用效果', 'interactions', { textarea: true, wide: true })}
                {field('副作用', 'sideEffects', { textarea: true, wide: true })}
                {field('禁忌与警示', 'contraindications', { textarea: true, wide: true })}
                {field('来源说明', 'source', { textarea: true, wide: true })}
              </>
            )}
            {type === 'disorders' && (
              <>
                {field('名称', 'name')}
                {field('分类', 'category')}
                {listField('别名（每行一项）', 'aliases')}
                {field('一句话介绍', 'summary', { textarea: true, wide: true })}
                {field('如何理解', 'details', { textarea: true, wide: true })}
                {listField('常见体验', 'symptoms')}
                {listField('来访者可能这样描述', 'patientPhrases')}
                {listField('病程线索', 'courseClues')}
                {listField('可能影响', 'functionalImpact')}
                {listField('评估时会关注', 'assessment')}
                {listField('需要鉴别', 'differentials')}
                {listField('治疗与支持概览', 'treatmentOverview')}
                {listField('需要尽快求助的信号', 'emergencySignals')}
                {listField('关联药物 ID', 'relatedDrugIds')}
                {field('来源说明', 'source', { textarea: true, wide: true })}
              </>
            )}
            {type === 'cases' && (
              <>
                {field('案例标题', 'title', { wide: true })}
                {field('所属疾病', 'disorderId', {
                  select: disorders.map((item) => ({ value: item.id, label: item.name }))
                })}
                {field('阶段标签', 'stage')}
                {field('案例摘要', 'summary', { textarea: true, wide: true })}
                {listField('主题标签', 'tags')}
                {listField('表现', 'presentation')}
                {field('时间线', 'timeline', { textarea: true, wide: true })}
                {field('功能影响', 'functionImpact', { textarea: true, wide: true })}
                {field('风险线索', 'riskSignals', { textarea: true, wide: true })}
                {listField('评估重点', 'assessmentFocus')}
                {listField('鉴别提示', 'differentialClues')}
                {field('安全提醒', 'safetyNote', { textarea: true, wide: true })}
                {field('来源说明', 'source', { textarea: true, wide: true })}
              </>
            )}
            {type === 'resources' && (
              <>
                {field('资源标题', 'title', { wide: true })}
                {field('类型', 'kind', {
                  select: [
                    { value: '网站', label: '网站' },
                    { value: '书籍', label: '书籍' },
                    { value: '指南', label: '指南' },
                    { value: '其他', label: '其他' }
                  ]
                })}
                {field('来源', 'source')}
                {field('描述', 'description', { textarea: true, wide: true })}
                {field('外部网址', 'url', { wide: true })}
              </>
            )}
          </div>
          <div className="modal-foot">
            <span><ShieldCheck size={14} /> 保存只写入本浏览器</span>
            <div>
              <button type="button" className="secondary-button" onClick={onClose}>取消</button>
              <button type="submit" className="primary-button"><Sparkles size={16} /> 保存词条</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
