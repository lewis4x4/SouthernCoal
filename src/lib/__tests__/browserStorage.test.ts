import { describe, expect, it, vi } from 'vitest';
import { createResilientBrowserStorage } from '@/lib/browserStorage';

describe('createResilientBrowserStorage', () => {
  it('falls back to in-memory storage when localStorage throws', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const failingStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: failingStorage,
    });

    const storage = createResilientBrowserStorage();
    storage.setItem('token', 'abc');
    expect(storage.getItem('token')).toBe('abc');
    storage.removeItem('token');
    expect(storage.getItem('token')).toBeNull();

    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });
});
