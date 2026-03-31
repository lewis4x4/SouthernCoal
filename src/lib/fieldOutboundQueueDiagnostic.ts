export const OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY = 'scc.fieldOutboundQueueDiagnostic.v1';

/** Same-tab sync: `storage` only fires across tabs */
export const OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT = 'scc:outbound-queue-diagnostic-changed';

function notifyOutboundQueueDiagnosticChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT));
}

type Stored = {
  version: 1;
  message: string;
  opKind: string;
  visitId: string;
  savedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type OutboundQueueFlushDiagnostic = {
  message: string;
  opKind: string;
  visitId: string;
};

export function readStoredOutboundQueueDiagnostic(): OutboundQueueFlushDiagnostic | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data) || data.version !== 1) return null;
    if (
      typeof data.message !== 'string' ||
      typeof data.opKind !== 'string' ||
      typeof data.visitId !== 'string'
    ) {
      return null;
    }
    return { message: data.message, opKind: data.opKind, visitId: data.visitId };
  } catch {
    return null;
  }
}

export function persistOutboundQueueDiagnostic(d: OutboundQueueFlushDiagnostic): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: Stored = {
      version: 1,
      message: d.message,
      opKind: d.opKind,
      visitId: d.visitId,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(payload));
    notifyOutboundQueueDiagnosticChanged();
  } catch {
    /* ignore */
  }
}

export function clearStoredOutboundQueueDiagnostic(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY);
    notifyOutboundQueueDiagnosticChanged();
  } catch {
    /* ignore */
  }
}
