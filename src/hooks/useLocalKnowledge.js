import { useEffect, useRef, useState } from 'react';
import { cloneSeed } from '../data.js';
import { deleteEntry, upsertEntry } from '../storage/operations.js';
import { readKnowledge, writeKnowledge } from '../storage/storage.js';

const STORAGE_ERROR_MESSAGE = '本地保存失败，请检查浏览器存储权限或复制当前内容。';

function initializeKnowledge() {
  const seedData = cloneSeed();
  const result = readKnowledge(window.localStorage, seedData, {
    legacySeedData: seedData
  });
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
      setStorageError(STORAGE_ERROR_MESSAGE);
      warnStorageError(error);
      return false;
    }
  }

  return {
    data: envelope.data,
    envelope,
    seedData: initial.seedData,
    storageError,
    saveEntry,
    removeEntry
  };
}
