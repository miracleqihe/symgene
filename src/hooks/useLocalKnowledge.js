import { useEffect, useRef, useState } from 'react';
import { cloneSeed } from '../data.js';
import { applyKnowledgeImport } from '../storage/importExport.js';
import { deleteEntry, upsertEntry } from '../storage/operations.js';
import {
  listBackups,
  readBackupRaw,
  readKnowledge,
  resetKnowledge,
  restoreBackup,
  writeKnowledge
} from '../storage/storage.js';

const STORAGE_ERROR_MESSAGE = '本地保存失败，请检查浏览器存储权限或复制当前内容。';

function initializeKnowledge() {
  const seedData = cloneSeed();
  const result = readKnowledge(window.localStorage, seedData);
  return { ...result, seedData };
}

function warnStorageError(error) {
  if (!import.meta.env.DEV) return;
  console.warn('Sym Gen 本地存储操作失败。', {
    name: error?.name,
    code: error?.code,
    stack: error?.stack
  });
}

export function useLocalKnowledge({ onSaved } = {}) {
  const [initial] = useState(initializeKnowledge);
  const [envelope, setEnvelope] = useState(initial.envelope);
  const [backups, setBackups] = useState(() => {
    try {
      return listBackups(window.localStorage);
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState(
    initial.error ? STORAGE_ERROR_MESSAGE : ''
  );
  const blockedRef = useRef(Boolean(initial.error));
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (initial.error) warnStorageError(initial.error);
  }, [initial]);

  function persist(nextEnvelope, successMessage) {
    if (blockedRef.current) {
      setStorageError(STORAGE_ERROR_MESSAGE);
      return false;
    }
    try {
      writeKnowledge(window.localStorage, nextEnvelope);
      setEnvelope(nextEnvelope);
      setStorageError('');
      onSavedRef.current?.(successMessage);
      return true;
    } catch (error) {
      setStorageError(STORAGE_ERROR_MESSAGE);
      warnStorageError(error);
      return false;
    }
  }

  function refreshBackups() {
    try {
      setBackups(listBackups(window.localStorage));
    } catch (error) {
      setStorageError(STORAGE_ERROR_MESSAGE);
      warnStorageError(error);
    }
  }

  function recoverWith(operation, successMessage) {
    try {
      const result = operation();
      setEnvelope(result.envelope);
      blockedRef.current = false;
      setStorageError('');
      refreshBackups();
      onSavedRef.current?.(successMessage);
      return true;
    } catch (error) {
      setStorageError(STORAGE_ERROR_MESSAGE);
      warnStorageError(error);
      return false;
    }
  }

  function saveEntry(type, item) {
    try {
      return persist(
        upsertEntry(envelope, type, item),
        '已保存到本地浏览器'
      );
    } catch (error) {
      setStorageError(STORAGE_ERROR_MESSAGE);
      warnStorageError(error);
      return false;
    }
  }

  function removeEntry(type, id) {
    try {
      return persist(
        deleteEntry(envelope, type, id, initial.seedData),
        '词条已删除'
      );
    } catch (error) {
      if (error?.code === 'dependency-conflict') {
        const item = envelope.data[type].find((entry) => entry.id === id);
        const label = item?.name || item?.title || '该疾病';
        setStorageError(
          `无法删除“${label}”：仍有 ${error.relatedCount} 个关联案例。`
          + '请先删除这些案例，或将它们改绑到其他疾病。'
        );
      } else {
        setStorageError(STORAGE_ERROR_MESSAGE);
      }
      warnStorageError(error);
      return false;
    }
  }

  function importEnvelope(nextEnvelope) {
    return recoverWith(
      () => applyKnowledgeImport(window.localStorage, nextEnvelope),
      '本地备份已导入'
    );
  }

  function restoreLocalBackup(backupKey) {
    return recoverWith(
      () => restoreBackup(window.localStorage, backupKey, initial.seedData),
      '本地备份已恢复'
    );
  }

  function resetLocalKnowledge() {
    return recoverWith(
      () => resetKnowledge(window.localStorage, initial.seedData),
      '已恢复项目默认数据'
    );
  }

  function getBackupRaw(backupKey) {
    return readBackupRaw(window.localStorage, backupKey);
  }

  return {
    data: envelope.data,
    envelope,
    seedData: initial.seedData,
    backups,
    storageError,
    saveEntry,
    removeEntry,
    importEnvelope,
    restoreLocalBackup,
    resetLocalKnowledge,
    getBackupRaw,
    refreshBackups
  };
}
