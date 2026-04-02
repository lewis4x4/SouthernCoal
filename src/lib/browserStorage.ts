type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();

  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key) ?? null : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

export function createResilientBrowserStorage(): StorageLike {
  const fallback = createMemoryStorage();

  const getNativeStorage = (): Storage | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      return null;
    }
  };

  return {
    getItem(key: string) {
      const storage = getNativeStorage();
      if (!storage) return fallback.getItem(key);
      try {
        return storage.getItem(key);
      } catch {
        return fallback.getItem(key);
      }
    },
    setItem(key: string, value: string) {
      const storage = getNativeStorage();
      if (!storage) {
        fallback.setItem(key, value);
        return;
      }
      try {
        storage.setItem(key, value);
      } catch {
        fallback.setItem(key, value);
      }
    },
    removeItem(key: string) {
      const storage = getNativeStorage();
      if (!storage) {
        fallback.removeItem(key);
        return;
      }
      try {
        storage.removeItem(key);
      } catch {
        fallback.removeItem(key);
      }
    },
  };
}
