import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cx, duration as fmt } from '../lib/format';

/** Compact voice-note player: ▶ 0:18 with a seekable progress bar. */
export function AudioPlayer({ src, seconds, tone = 'default' }: { src: string; seconds: number; tone?: 'default' | 'mine' }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setPos(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onErr = () => setError(true);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('pause', onPause);
    a.addEventListener('play', onPlay);
    a.addEventListener('error', onErr);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('error', onErr);
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // Only one voice note plays at a time.
      document.querySelectorAll('audio').forEach((el) => el !== a && el.pause());
      a.play().catch(() => setError(true));
    } else a.pause();
  };

  const total = seconds || 1;
  const pct = Math.min(100, (pos / total) * 100);

  return (
    <div className="flex w-[220px] max-w-full items-center gap-2.5">
      <audio ref={audio} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
          tone === 'mine' ? 'bg-accent text-accent-ink' : 'bg-ink text-canvas',
          error && 'opacity-40',
        )}
      >
        {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="ml-0.5 size-3.5" fill="currentColor" />}
      </button>
      <div className="flex-1">
        <div
          className="relative h-1.5 cursor-pointer rounded-full bg-line-strong/70"
          onClick={(e) => {
            const a = audio.current;
            if (!a || !Number.isFinite(total)) return;
            const r = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - r.left) / r.width) * total;
            setPos(a.currentTime);
          }}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="tabular text-xs text-ink-3">{error ? 'Unavailable' : fmt(playing || pos ? pos : seconds)}</span>
    </div>
  );
}
