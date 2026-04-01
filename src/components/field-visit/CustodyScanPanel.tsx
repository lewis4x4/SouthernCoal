import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ScanLine, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { barcodeScannerSupported } from '@/lib/containerScan';
import type {
  FieldVisitContainerCaptureMethod,
  FieldVisitContainerValidation,
} from '@/types';

type BarcodeDetection = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetection[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

interface CustodyScanPanelProps {
  containerId: string;
  captureMethod: FieldVisitContainerCaptureMethod;
  preservativeConfirmed: boolean;
  validation: FieldVisitContainerValidation;
  disabled: boolean;
  saving: boolean;
  onContainerIdChange: (value: string) => void;
  onCaptureMethodChange: (value: FieldVisitContainerCaptureMethod) => void;
  onPreservativeConfirmedChange: (value: boolean) => void;
  onScanDetected: (rawValue: string) => void;
  onSave: () => void;
}

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

function validationToneClasses(status: FieldVisitContainerValidation['status']) {
  switch (status) {
    case 'match':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
    case 'warning':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
    default:
      return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
  }
}

export function CustodyScanPanel({
  containerId,
  captureMethod,
  preservativeConfirmed,
  validation,
  disabled,
  saving,
  onContainerIdChange,
  onCaptureMethodChange,
  onPreservativeConfirmedChange,
  onScanDetected,
  onSave,
}: CustodyScanPanelProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState('Ready to scan the primary container.');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerSupported = useMemo(() => barcodeScannerSupported(), []);

  useEffect(() => {
    if (!scannerOpen) {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      return;
    }

    if (!scannerSupported) {
      setScannerError('Camera barcode scanning is not available on this device. Use manual entry below.');
      return;
    }

    const DetectorCtor = getBarcodeDetectorCtor();
    if (!DetectorCtor) {
      setScannerError('Barcode detector is unavailable in this browser. Use manual entry below.');
      return;
    }

    let cancelled = false;
    let busy = false;

    const start = async () => {
      try {
        setScannerError(null);
        setScannerStatus('Requesting camera access…');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setScannerStatus('Point the camera at the container barcode or QR label.');

        const detector = new DetectorCtor({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
        });

        intervalRef.current = window.setInterval(async () => {
          if (busy || !videoRef.current) return;
          busy = true;
          try {
            const detections = await detector.detect(videoRef.current);
            const rawValue = detections.find((item) => item.rawValue?.trim())?.rawValue?.trim();
            if (rawValue) {
              onScanDetected(rawValue);
              onCaptureMethodChange('scan');
              setScannerStatus('Container captured from scan.');
              setScannerOpen(false);
            }
          } catch (error) {
            setScannerError(error instanceof Error ? error.message : 'Scanner failed. Use manual entry below.');
          } finally {
            busy = false;
          }
        }, 350);
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : 'Could not access the camera.');
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, [onCaptureMethodChange, onScanDetected, scannerOpen, scannerSupported]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Chain of custody
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            Scan the primary container first. Typing stays available as a fallback when scanning is not possible.
          </p>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-text-secondary">
          {captureMethod === 'scan' ? 'Captured by scan' : 'Manual fallback'}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setScannerOpen((current) => !current)}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
        >
          <ScanLine className="h-4 w-4" aria-hidden />
          {scannerOpen ? 'Stop scanner' : 'Scan container'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Camera className="h-3.5 w-3.5" aria-hidden />
          {scannerSupported ? 'Camera barcode detection available' : 'Camera scanner unavailable on this device'}
        </div>
      </div>

      {scannerOpen ? (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full rounded-xl border border-white/[0.08] bg-black object-cover"
          />
          <p className="mt-3 text-sm text-text-secondary">{scannerStatus}</p>
          {scannerError ? (
            <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {scannerError}
            </div>
          ) : null}
        </div>
      ) : null}

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Primary container ID
        </span>
        <input
          value={containerId}
          onChange={(event) => {
            onCaptureMethodChange('manual');
            onContainerIdChange(event.target.value);
          }}
          disabled={disabled}
          placeholder="Fallback when scan is unavailable"
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
        />
      </label>

      {validation.message ? (
        <div className={cn('mt-4 rounded-xl border px-4 py-3 text-sm', validationToneClasses(validation.status))}>
          <div className="flex items-start gap-3">
            {validation.status === 'match' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : validation.status === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div>{validation.message}</div>
              {validation.guidance.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs">
                  {validation.guidance.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={preservativeConfirmed}
          onChange={(event) => onPreservativeConfirmedChange(event.target.checked)}
          disabled={disabled}
        />
        Bottle and preservative match the scheduled sample plan
      </label>

      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="mt-4 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.1] disabled:opacity-60"
      >
        Save chain of custody
      </button>
    </div>
  );
}
