import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 180;

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
}

export interface Recording {
  blob: Blob;
  duration: number;
  url: string;
}

/** Records compressed (Opus, ~24 kbps) voice notes with the MediaRecorder API. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const resolveRef = useRef<((r: Recording | null) => void) | null>(null);
  const cancelled = useRef(false);

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setRecording(false);
  };

  useEffect(() => () => {
    cancelled.current = true;
    recRef.current?.state === 'recording' && recRef.current.stop();
    cleanup();
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!supported) {
      setError('Voice notes are not supported in this browser.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24_000 });
      const chunks: BlobPart[] = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        cleanup();
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (cancelled.current || !blob.size) resolve?.(null);
        else resolve?.({ blob, duration, url: URL.createObjectURL(blob) });
      };
      rec.start(250);
      recRef.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = Math.round((Date.now() - startedAt.current) / 1000);
        setElapsed(s);
        if (s >= MAX_SECONDS) rec.state === 'recording' && rec.stop();
      }, 250);
      return true;
    } catch {
      cleanup();
      setError('Microphone permission was denied. Allow microphone access in your browser settings.');
      return false;
    }
  }, [supported]);

  /** Stops and resolves with the recording (or null if cancelled). */
  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const rec = recRef.current;
        if (!rec || rec.state !== 'recording') return resolve(null);
        resolveRef.current = resolve;
        rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    const rec = recRef.current;
    if (rec && rec.state === 'recording') rec.stop();
    else cleanup();
  }, []);

  return { supported, recording, elapsed, error, start, stop, cancel, maxSeconds: MAX_SECONDS };
}
