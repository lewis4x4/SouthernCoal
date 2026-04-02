export function readStoredBoolean(key: string, fallback = false): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return fallback;
  }
}

export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* non-critical */
  }
}

export function readStoredString(key: string, fallback: string | null = null): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return fallback;
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* non-critical */
  }
}
