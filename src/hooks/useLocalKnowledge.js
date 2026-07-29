import { useEffect, useRef, useState } from 'react';
import { STORAGE_KEY } from '../storage/constants.js';
import { readLegacyData } from '../storage/legacyStorage.js';

export function useLocalKnowledge({ onSaved } = {}) {
  const [data, setData] = useState(readLegacyData);
  const [storageError, setStorageError] = useState('');
  const pendingMessageRef = useRef('');
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageError('');
      if (pendingMessageRef.current) {
        onSavedRef.current?.(pendingMessageRef.current);
      }
    } catch (error) {
      setStorageError('本地保存失败，请检查浏览器存储权限或复制当前内容。');
      if (import.meta.env.DEV) {
        console.warn('无法将 Sym Gen 数据写入本地存储。', error);
      }
    } finally {
      pendingMessageRef.current = '';
    }
  }, [data]);

  function updateData(updater, successMessage = '') {
    pendingMessageRef.current = successMessage;
    setData(updater);
  }

  return { data, storageError, updateData };
}
