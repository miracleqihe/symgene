import React, { useRef, useState } from 'react';
import {
  Download,
  FileUp,
  History,
  RotateCcw,
  X
} from 'lucide-react';
import {
  createKnowledgeExport,
  downloadTextFile,
  knowledgeExportFilename,
  MAX_IMPORT_BYTES,
  parseKnowledgeImport,
  summarizeKnowledgeImport
} from '../../storage/importExport.js';
import { useDialogFocus } from '../../hooks/useDialogFocus.js';

const TYPE_LABELS = {
  drugs: '药物',
  disorders: '疾病',
  cases: '案例',
  resources: '资源'
};

function describeError(error) {
  const field = error?.details?.[0]?.field;
  return field
    ? `${error.message} 首个错误字段：${field}`
    : (error?.message || '本地数据操作失败，请稍后重试。');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function summaryMessage(summary) {
  const counts = Object.entries(summary.counts)
    .map(([type, count]) => `${TYPE_LABELS[type]} ${count}`)
    .join('，');
  return [
    '确认导入这份本地备份吗？',
    counts,
    `新增 ${summary.added}，覆盖 ${summary.overwritten}，删除记录 ${summary.deleted}`,
    `结构版本 ${summary.schemaVersion}，种子版本 ${summary.seedVersion}`,
    '导入前会自动备份当前数据。'
  ].join('\n');
}

function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('无法读取所选文件。')));
    reader.readAsText(file);
  });
}

export function LocalDataPanel({
  backups,
  envelope,
  seedData,
  onClose,
  onImport,
  onReadBackup,
  onReset,
  onRestore
}) {
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, onClose);

  function exportCurrent() {
    try {
      const now = new Date();
      const payload = createKnowledgeExport(envelope, { now });
      downloadTextFile(
        JSON.stringify(payload, null, 2),
        knowledgeExportFilename(now)
      );
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setErrorMessage('导入文件超过 5 MB 上限。');
      return;
    }
    setBusy(true);
    try {
      const text = await readFileText(file);
      const parsed = parseKnowledgeImport(text, {
        size: file.size,
        seedData
      });
      const summary = summarizeKnowledgeImport(parsed.envelope, envelope);
      if (!window.confirm(summaryMessage(summary))) return;
      if (!onImport(parsed.envelope)) {
        setErrorMessage('导入写入失败，当前数据未改变。');
        return;
      }
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  function exportRaw(backup) {
    try {
      const rawValue = onReadBackup(backup.key);
      const date = backup.savedAt?.slice(0, 10) || 'unknown-date';
      downloadTextFile(rawValue, `symgene-raw-backup-${date}.json`);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  function restore(backup) {
    const confirmed = window.confirm([
      '确认恢复这份自动备份吗？',
      '目标备份会先经过完整性校验；通过后才会再次备份当前数据并恢复。'
    ].join('\n'));
    if (!confirmed) return;
    if (!onRestore(backup.key)) {
      setErrorMessage('备份恢复失败，当前数据未改变。');
      return;
    }
    setErrorMessage('');
  }

  function reset() {
    const confirmed = window.confirm([
      '确认恢复项目默认数据吗？',
      '自定义新增、修改和删除记录将从当前状态移除；操作前会自动备份。'
    ].join('\n'));
    if (!confirmed) return;
    if (!onReset()) {
      setErrorMessage('恢复默认数据失败，当前数据未改变。');
      return;
    }
    setErrorMessage('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="editor-modal local-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-data-title"
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">LOCAL DATA</span>
            <h2 id="local-data-title">本地数据</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭本地数据">
            <X size={18} />
          </button>
        </div>

        <div className="local-data-content">
          <p className="local-data-note">
            这些工具只处理本浏览器内的数据，不会上传到网络。恢复会先验证目标备份；
            验证通过后，导入、恢复和重置才会备份当前状态并写入。
          </p>
          <div className="local-data-actions">
            <button type="button" className="secondary-button" onClick={exportCurrent}>
              <Download size={15} /> 导出备份
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp size={15} /> {busy ? '正在检查…' : '导入备份'}
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              aria-label="选择本地备份文件"
              onChange={importFile}
            />
            <button type="button" className="secondary-button danger-action" onClick={reset}>
              <RotateCcw size={15} /> 恢复默认数据
            </button>
          </div>

          {errorMessage && <p className="local-data-error" role="alert">{errorMessage}</p>}

          <div className="backup-list">
            <div className="backup-list-heading">
              <History size={15} />
              <strong>可恢复的自动备份</strong>
              <span>{backups.length} / 5</span>
            </div>
            {!backups.length && <p className="muted">目前没有自动备份。</p>}
            {backups.map((backup) => (
              <article className="backup-row" key={backup.key}>
                <div>
                  <strong>{backup.savedAt ? new Date(backup.savedAt).toLocaleString() : '时间未知'}</strong>
                  <small>
                    结构版本 {backup.schemaVersion ?? '未知'} ·
                    种子版本 {backup.seedVersion ?? '未知'} · {formatBytes(backup.bytes)}
                  </small>
                </div>
                <div>
                  <button type="button" className="text-button" onClick={() => exportRaw(backup)}>
                    导出原始备份
                  </button>
                  <button type="button" className="text-button" onClick={() => restore(backup)}>
                    恢复
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
