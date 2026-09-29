import { useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'jpm-theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function apply() {
  const pref = read();
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1c1f' : '#ffffff');
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === 'light') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onMedia = () => {
    apply();
    l();
  };
  media?.addEventListener('change', onMedia);
  return () => {
    listeners.delete(l);
    media?.removeEventListener('change', onMedia);
  };
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, read);
  const resolved = useSyncExternalStore(subscribe, () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')) as 'light' | 'dark';
  useEffect(apply, []);
  return { pref, resolved, setTheme };
}
