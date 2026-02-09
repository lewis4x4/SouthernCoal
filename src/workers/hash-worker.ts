/**
 * Web Worker for SHA-256 file hashing.
 * Receives an ArrayBuffer, returns hex string.
 * Runs off main thread to keep UI at 60fps during hashing.
 */
self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', e.data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    self.postMessage({ type: 'success', hash: hashHex });
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : 'Hash computation failed',
    });
  }
};
