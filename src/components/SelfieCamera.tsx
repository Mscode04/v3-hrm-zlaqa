'use client';
// Front-camera selfie capture with a burned-in timestamp (anti-proxy).
// Falls back to file upload (which opens the camera on phones) if getUserMedia is blocked.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RefreshCw, Upload } from 'lucide-react';
import { Button, Modal } from './ui';

const WIDTH = 400;

function stamp(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(0, h - 24, w, 24);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${label} · ${new Date().toLocaleString()}`, 8, h - 8);
}

export interface SelfieCameraProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  onSkip?: () => void;
  skipLabel?: string;
  busy?: boolean;
}

export function SelfieCamera({
  open,
  title = 'Selfie',
  onCapture,
  onClose,
  onSkip,
  skipLabel = 'Skip photo',
  busy,
}: SelfieCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const hasSkip = Boolean(onSkip);

  useEffect(() => {
    if (!open || shot) return;
    let cancelled = false;
    setError('');
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            return;
          }
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setError(
            hasSkip
              ? 'Camera not available. You can upload a photo or skip below.'
              : 'Camera not available. Allow camera access in your browser, or upload a photo instead.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, shot, hasSkip]);

  useEffect(() => {
    if (!open) {
      setShot(null);
      setError('');
      setReady(false);
    }
  }, [open]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const h = Math.round((v.videoHeight / v.videoWidth) * WIDTH);
    const c = document.createElement('canvas');
    c.width = WIDTH;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) {
      setError('Could not process camera image in this browser.');
      return;
    }
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1); // mirror like the preview
    ctx.drawImage(v, 0, 0, WIDTH, h);
    stamp(ctx, WIDTH, h, title);
    setError('');
    setShot(c.toDataURL('image/jpeg', 0.72));
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const objectUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (!img.width || !img.height) {
        setError('Could not read image dimensions. Try another photo.');
        return;
      }
      const h = Math.round((img.height / img.width) * WIDTH);
      const c = document.createElement('canvas');
      c.width = WIDTH;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        setError('Could not process image in this browser.');
        return;
      }
      ctx.drawImage(img, 0, 0, WIDTH, h);
      stamp(ctx, WIDTH, h, title + ' (upload)');
      setError('');
      setShot(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError('Could not read that image. Try another photo.');
    };
    img.src = objectUrl;
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onSkip ? (
            <Button variant="ghost" onClick={onSkip} disabled={busy}>
              {skipLabel}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {shot ? (
              <>
                <Button variant="secondary" onClick={() => setShot(null)} disabled={busy}>
                  <RefreshCw size={16} /> Retake
                </Button>
                <Button onClick={() => onCapture(shot)} disabled={busy}>
                  {busy ? 'Saving…' : 'Use this photo'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Upload size={16} /> Upload
                </Button>
                <Button onClick={capture} disabled={!ready || busy}>
                  <Camera size={16} /> Capture
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative mx-auto aspect-[4/3] max-h-[45dvh] w-full overflow-hidden rounded-2xl bg-neutral-900">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot} alt="selfie preview" className="h-full w-full object-contain" />
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          )}
          {!shot && !ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">Starting camera…</div>}
          {error && !shot && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-neutral-200">{error}</div>}
          {!shot && ready && <div className="pointer-events-none absolute inset-8 rounded-full border-2 border-dashed border-white/40" />}
        </div>
        {onSkip && (
          <p className="text-xs text-neutral-500">
            Selfie is optional — take or upload a photo, or skip to continue without one.
          </p>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="user" disabled={busy} className="hidden" onChange={onFile} />
      </div>
    </Modal>
  );
}
