import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Keyboard, Mic, RotateCcw, Square } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { cx, PRIORITY_LABEL, taskLabel, UNITS, fmtDateOnly } from '../lib/format';
import { useCreateTask, useSections, useUsers, type TaskInput } from '../lib/queries';
import { SPEECH_LANGUAGES, useSpeech } from '../lib/speech';
import type { ParsedPurchase, Priority } from '../lib/types';
import { useAppState } from './app-state';
import { Button, Dialog, Input, Select, Spinner, Textarea } from './ui';

type Step = 'listen' | 'parsing' | 'review';

const LANG_KEY = 'jpm-voice-lang';
function savedLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? 'en-IN';
  } catch {
    return 'en-IN';
  }
}

export function VoiceTaskDialog() {
  const { voiceOpen, closeVoice, openTask } = useAppState();
  const speech = useSpeech();
  const sections = useSections();
  const users = useUsers();
  const create = useCreateTask();
  const [lang, setLang] = useState(savedLang);
  const [step, setStep] = useState<Step>('listen');
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [parsed, setParsed] = useState<ParsedPurchase | null>(null);
  const [form, setForm] = useState<TaskInput | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const reset = () => {
    setStep('listen');
    setParsed(null);
    setForm(null);
    setParseError(null);
    setTyped('');
    speech.setTranscript('');
  };

  const runParse = async (text: string) => {
    const transcript = text.trim();
    if (!transcript) {
      setParseError('Voice could not be understood. Please try again or create the task manually.');
      setStep('listen');
      return;
    }
    setStep('parsing');
    setParseError(null);
    try {
      const { data } = await api.post<ParsedPurchase>('/voice/parse', { transcript });
      setParsed(data);
      setForm({
        title: data.title ?? '',
        quantity: data.quantity ?? NaN,
        unit: data.unit,
        sectionId: data.section?.id ?? null,
        assignedTo: data.assignee?.id ?? null,
        priority: data.priority,
        dueDate: data.dueDate,
        description: null,
      });
      setStep('review');
    } catch (e) {
      setParseError(errorMessage(e, 'Voice could not be understood. Please try again or create the task manually.'));
      setStep('listen');
    }
  };

  const listen = () => {
    reset();
    setTyping(false);
    speech.start(lang, (text) => runParse(text));
  };

  // Start listening as soon as the dialog opens (the user explicitly asked to speak).
  useEffect(() => {
    if (!voiceOpen) {
      startedRef.current = false;
      speech.abort();
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    reset();
    if (speech.supported) {
      setTyping(false);
      speech.start(lang, (text) => runParse(text));
    } else setTyping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOpen]);

  const changeLang = (code: string) => {
    setLang(code);
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* ignore */
    }
    if (speech.state === 'listening') {
      speech.abort();
      setTimeout(() => speech.start(code, (text) => runParse(text)), 150);
    }
  };

  const submit = async () => {
    if (!form) return;
    if (!form.title.trim() || !Number.isFinite(form.quantity) || form.quantity <= 0) {
      toast.error('Please fill in the item and quantity before creating the task.');
      return;
    }
    try {
      const { task } = await create.mutateAsync({ input: { ...form, title: form.title.trim() }, files: [], source: 'voice' });
      closeVoice();
      toast.success('Task created successfully', { description: taskLabel(task), action: { label: 'Open', onClick: () => openTask(task.id) } });
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to create task. Please try again.'));
    }
  };

  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const listening = speech.state === 'listening';
  const canCreate = !!form && !!form.title.trim() && Number.isFinite(form.quantity) && form.quantity > 0;

  return (
    <Dialog
      open={voiceOpen}
      onClose={closeVoice}
      title={step === 'review' ? 'Detected purchase' : 'Create with voice'}
      width="max-w-md"
      footer={
        step === 'review' ? (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={listen} className="mr-auto" disabled={!speech.supported}>
              Try again
            </Button>
            <Button onClick={closeVoice}>Cancel</Button>
            <Button variant="primary" loading={create.isPending} disabled={!canCreate} onClick={submit}>
              Create Task
            </Button>
          </>
        ) : undefined
      }
    >
      {step !== 'review' && (
        <div className="px-5 pt-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-md bg-subtle p-0.5" role="radiogroup" aria-label="Language">
              {SPEECH_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  role="radio"
                  aria-checked={lang === l.code}
                  onClick={() => changeLang(l.code)}
                  className={cx('rounded px-2.5 py-1 text-xs font-medium', lang === l.code ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {speech.supported && (
              <button
                onClick={() => {
                  speech.abort();
                  setTyping((t) => !t);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink"
              >
                {typing ? <Mic className="size-3.5" /> : <Keyboard className="size-3.5" />}
                {typing ? 'Speak' : 'Type instead'}
              </button>
            )}
          </div>

          {step === 'parsing' ? (
            <div className="flex flex-col items-center py-10">
              <Spinner className="size-6" />
              <p className="mt-3 text-sm text-ink-2">Understanding your request…</p>
            </div>
          ) : typing ? (
            <div className="pt-5">
              {!speech.supported && <p className="mb-3 text-sm text-ink-2">Voice input isn’t available in this browser. Type the request the way you would say it.</p>}
              <Textarea
                data-autofocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    runParse(typed);
                  }
                }}
                rows={3}
                placeholder="Maintenance-ku rendu bearing urgent-ah venum, Ashok-ku assign pannunga"
              />
              {parseError && <p className="mt-2 text-sm text-urgent">{parseError}</p>}
              <div className="mt-3 flex justify-end">
                <Button variant="primary" onClick={() => runParse(typed)} disabled={!typed.trim()}>
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center pt-8">
              <button
                onClick={() => (listening ? speech.stop() : listen())}
                aria-label={listening ? 'Stop listening' : 'Start listening'}
                className={cx(
                  'relative flex size-20 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95',
                  listening ? 'bg-urgent' : 'bg-accent',
                )}
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-full bg-urgent/40" />}
                {listening ? <Square className="relative size-7" fill="currentColor" /> : <Mic className="relative size-8" />}
              </button>
              <p className="mt-4 text-sm font-medium text-ink">{listening ? 'Listening… tap to finish' : 'Tap the microphone and speak'}</p>

              <div className="mt-4 min-h-[56px] w-full rounded-lg bg-subtle px-4 py-3 text-center text-[15px] text-ink" aria-live="polite">
                {speech.transcript || (
                  <span className="text-sm text-ink-3">
                    Say what, how many, which section and who should buy it.
                    <br />
                    <span className="italic">“Electrical-ku 10 meter cable urgent-ah purchase pannunga”</span>
                  </span>
                )}
              </div>
              {(speech.error || parseError) && (
                <p className="mt-3 text-center text-sm text-urgent" role="alert">
                  {speech.error ?? parseError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'review' && form && parsed && (
        <div className="space-y-4 px-5 py-4">
          <p className="rounded-md bg-subtle px-3 py-2 text-[13px] text-ink-2">
            <span className="text-ink-3">You said: </span>“{parsed.transcript}”
          </p>

          {(parsed.unmatched.section || parsed.unmatched.person || !parsed.confident) && (
            <div className="flex gap-2 rounded-md border border-high/30 bg-high-soft px-3 py-2 text-[13px] text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-high" />
              <div className="space-y-0.5">
                {!parsed.confident && <p>Some details weren’t clear. Please check before creating.</p>}
                {parsed.unmatched.section && <p>Section “{parsed.unmatched.section}” was not found — choose one below or leave it for the Inbox.</p>}
                {parsed.unmatched.person && <p>“{parsed.unmatched.person}” is not a user — choose who should purchase it.</p>}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-line">
            <ReviewRow label="Item" missing={!form.title.trim()}>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="What to purchase" data-autofocus={!form.title ? true : undefined} />
            </ReviewRow>
            <ReviewRow label="Quantity" missing={!Number.isFinite(form.quantity)}>
              <div className="flex">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={Number.isFinite(form.quantity) ? form.quantity : ''}
                  onChange={(e) => set('quantity', e.target.value === '' ? NaN : Number(e.target.value))}
                  className="rounded-r-none"
                />
                <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="w-28 rounded-l-none border-l-0" aria-label="Unit">
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </div>
            </ReviewRow>
            <ReviewRow label="Section" missing={!form.sectionId}>
              <Select value={form.sectionId ?? ''} onChange={(e) => set('sectionId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Inbox (no section)</option>
                {sections.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </ReviewRow>
            <ReviewRow label="Assigned to" missing={!form.assignedTo}>
              <Select value={form.assignedTo ?? ''} onChange={(e) => set('assignedTo', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Unassigned</option>
                {users.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </ReviewRow>
            <ReviewRow label="Priority">
              <Select value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)} className={cx(form.priority === 'urgent' && 'text-urgent', form.priority === 'high' && 'text-high')}>
                {(['normal', 'high', 'urgent'] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </ReviewRow>
            {form.dueDate && (
              <ReviewRow label="Due">
                <div className="flex items-center gap-2">
                  <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value || null)} />
                  <span className="hidden text-xs whitespace-nowrap text-ink-3 sm:inline">{fmtDateOnly(form.dueDate)}</span>
                </div>
              </ReviewRow>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ReviewRow({ label, missing, children }: { label: string; missing?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <span className={cx('text-[13px] font-medium', missing ? 'text-high' : 'text-ink-3')}>
        {label}
        {missing && <span className="block text-[11px] font-normal">Not detected</span>}
      </span>
      {children}
    </div>
  );
}
