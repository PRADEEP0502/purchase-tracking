import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech-to-text provider abstraction. The default provider uses the browser's built-in
 * speech recognition (Chrome, Edge, Android, Safari), which supports Tamil (ta-IN) and
 * Indian English (en-IN). Another provider (e.g. a server-side service) can implement the
 * same interface without changing the voice task UI.
 */
export interface SpeechProvider {
  readonly supported: boolean;
  start(opts: { lang: string; onPartial: (text: string) => void; onFinal: (text: string) => void; onError: (message: string) => void; onEnd: () => void }): void;
  stop(): void;
  abort(): void;
}

export const SPEECH_LANGUAGES = [
  { code: 'en-IN', label: 'English / Tanglish' },
  { code: 'ta-IN', label: 'தமிழ் Tamil' },
] as const;

type Recognition = any;

function browserProvider(): SpeechProvider {
  const Ctor: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  let rec: Recognition | null = null;
  let session: { aborted: boolean } | null = null;

  return {
    supported: !!Ctor,
    start({ lang, onPartial, onFinal, onError, onEnd }) {
      if (!Ctor) return onError('Voice input is not supported in this browser. Please use Chrome or Edge, or type the request.');
      if (session) session.aborted = true;
      rec?.abort();
      const current = { aborted: false };
      session = current;
      rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      let finalText = '';
      rec.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += `${r[0].transcript} `;
          else interim += r[0].transcript;
        }
        onPartial((finalText + interim).trim());
      };
      rec.onerror = (e: any) => {
        const map: Record<string, string> = {
          'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser settings.',
          'service-not-allowed': 'Microphone permission was denied. Allow microphone access in your browser settings.',
          'no-speech': 'No speech was detected. Please try again.',
          'audio-capture': 'No microphone was found.',
          network: 'Voice recognition needs an internet connection. Please try again or type the request.',
          'language-not-supported': 'This language is not supported by your browser. Try English.',
        };
        if (e.error !== 'aborted' && !current.aborted) onError(map[e.error] ?? 'Voice could not be understood. Please try again or create the task manually.');
      };
      rec.onend = () => {
        // An aborted session (dialog closed, language switched) must never produce a result.
        if (current.aborted) return;
        onFinal(finalText.trim());
        onEnd();
        rec = null;
      };
      rec.start();
    },
    stop() {
      rec?.stop();
    },
    abort() {
      if (session) session.aborted = true;
      rec?.abort();
      rec = null;
    },
  };
}

export const speechProvider: SpeechProvider = browserProvider();

export type ListenState = 'idle' | 'listening' | 'done' | 'error';

export function useSpeech() {
  const [state, setState] = useState<ListenState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<(text: string) => void>(() => {});

  useEffect(() => () => speechProvider.abort(), []);

  const start = useCallback((lang: string, onFinal: (text: string) => void) => {
    finalRef.current = onFinal;
    setError(null);
    setTranscript('');
    setState('listening');
    let failed = false;
    speechProvider.start({
      lang,
      onPartial: setTranscript,
      onFinal: (text) => {
        if (!failed) finalRef.current(text);
      },
      onError: (msg) => {
        failed = true;
        setError(msg);
        setState('error');
      },
      onEnd: () => setState((s) => (s === 'error' ? s : 'done')),
    });
  }, []);

  return { supported: speechProvider.supported, state, transcript, error, start, stop: () => speechProvider.stop(), abort: () => {
      speechProvider.abort();
      setState('idle');
    }, setTranscript };
}
