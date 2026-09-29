import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Mic, Paperclip, SendHorizontal, Square, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { cx, duration, fileSize, fmtDate, fmtTime } from '../lib/format';
import { useInvalidateTasks, useMe, useThread } from '../lib/queries';
import { useRecorder, type Recording } from '../lib/recorder';
import type { ThreadItem } from '../lib/types';
import { AudioPlayer } from './AudioPlayer';
import { ACCEPT, checkFiles } from './TaskForm';
import { Avatar, ErrorState, IconButton, Spinner } from './ui';

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return fmtDate(iso);
}

function Bubble({ item, mine }: { item: ThreadItem; mine: boolean }) {
  return (
    <div className={cx('flex gap-2.5', mine && 'flex-row-reverse')}>
      <Avatar name={item.userName} size={26} className="mt-0.5" />
      <div className={cx('max-w-[82%] min-w-0', mine && 'items-end text-right')}>
        <div className={cx('mb-0.5 flex items-baseline gap-2 text-xs', mine && 'justify-end')}>
          <span className="font-semibold text-ink">{mine ? 'You' : item.userName}</span>
          <span className="text-ink-3">{fmtTime(item.createdAt)}</span>
        </div>
        <div
          className={cx(
            'inline-block rounded-xl px-3 py-2 text-left text-sm',
            mine ? 'rounded-tr-sm bg-accent-soft text-ink' : 'rounded-tl-sm bg-subtle text-ink',
          )}
        >
          {item.kind === 'comment' && <p className="break-words whitespace-pre-wrap">{item.message}</p>}
          {item.kind === 'voice' && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-2">
                <Mic className="size-3" /> Voice note
              </p>
              <AudioPlayer src={item.url} seconds={item.duration} tone={mine ? 'mine' : 'default'} />
            </div>
          )}
          {item.kind === 'attachment' &&
            (item.fileType.startsWith('image/') ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="block">
                <img src={item.url} alt={item.fileName} loading="lazy" className="max-h-48 max-w-full rounded-md border border-line object-cover" />
                <span className="mt-1 block truncate text-xs text-ink-2">{item.fileName}</span>
              </a>
            ) : (
              <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                <FileText className="size-5 shrink-0 text-ink-3" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.fileName}</span>
                  <span className="text-xs text-ink-3">{fileSize(item.fileSize)}</span>
                </span>
              </a>
            ))}
        </div>
      </div>
    </div>
  );
}

export function Thread({ taskId }: { taskId: number }) {
  const thread = useThread(taskId);
  const me = useMe();
  const bottom = useRef<HTMLDivElement>(null);
  const items = thread.data ?? [];

  // Scroll to a new message when one arrives, but not on first load (the task summary should stay in view).
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!thread.isSuccess) return;
    if (seen.current !== null && items.length > seen.current) {
      bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    seen.current = items.length;
  }, [items.length, thread.isSuccess]);

  if (thread.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (thread.isError) return <ErrorState message="Unable to load messages." onRetry={() => thread.refetch()} />;

  if (!items.length) {
    return <p className="px-1 py-6 text-center text-sm text-ink-3">No messages yet. Discuss this purchase here instead of WhatsApp.</p>;
  }

  let lastDay = '';
  return (
    <div className="space-y-4 py-2">
      {items.map((item) => {
        const day = dayLabel(item.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={`${item.kind}-${item.id}`}>
            {showDay && (
              <div className="my-3 flex items-center gap-3 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                <span className="h-px flex-1 bg-line" />
                {day}
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <Bubble item={item} mine={item.userId === me.data?.id} />
          </div>
        );
      })}
      <div ref={bottom} />
    </div>
  );
}

/** Message composer: text, voice note and attachments. */
export function Composer({ taskId }: { taskId: number }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voice, setVoice] = useState<Recording | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRecorder();
  const invalidate = useInvalidateTasks();
  const qc = useQueryClient();

  useEffect(() => () => (voice ? URL.revokeObjectURL(voice.url) : undefined), [voice]);

  const afterSend = () => {
    qc.invalidateQueries({ queryKey: ['thread', taskId] });
    invalidate(taskId);
  };

  const sendText = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { message });
      setText('');
      afterSend();
    } catch (e) {
      toast.error(errorMessage(e, 'Message not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const sendVoice = async () => {
    if (!voice) return;
    setSending(true);
    try {
      const fd = new FormData();
      const ext = voice.blob.type.includes('mp4') ? 'm4a' : voice.blob.type.includes('ogg') ? 'ogg' : 'webm';
      fd.append('audio', voice.blob, `voice.${ext}`);
      fd.append('duration', String(voice.duration));
      await api.post(`/tasks/${taskId}/voice`, fd);
      setVoice(null);
      afterSend();
      toast.success('Voice note sent');
    } catch (e) {
      toast.error(errorMessage(e, 'Voice note not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const err = checkFiles(files);
    if (err) return toast.error(err);
    setSending(true);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      await api.post(`/tasks/${taskId}/attachments`, fd);
      afterSend();
      toast.success(files.length > 1 ? `${files.length} files attached` : 'File attached');
    } catch (e) {
      toast.error(errorMessage(e, 'File upload failed. Maximum file size is 10 MB.'));
    } finally {
      setSending(false);
    }
  };

  if (rec.recording || voice) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface p-2">
        {rec.recording ? (
          <>
            <span className="ml-1 size-2.5 animate-pulse rounded-full bg-urgent" />
            <span className="tabular flex-1 text-sm text-ink">
              Recording {duration(rec.elapsed)} <span className="text-ink-3">/ {duration(rec.maxSeconds)}</span>
            </span>
            <IconButton label="Discard recording" onClick={rec.cancel}>
              <Trash2 className="size-4" />
            </IconButton>
            <button
              type="button"
              onClick={async () => setVoice(await rec.stop())}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-urgent px-3 text-sm font-medium text-white"
            >
              <Square className="size-3" fill="currentColor" /> Stop
            </button>
          </>
        ) : (
          voice && (
            <>
              <div className="flex-1 pl-1">
                <AudioPlayer src={voice.url} seconds={voice.duration} tone="mine" />
              </div>
              <IconButton label="Discard" onClick={() => setVoice(null)} disabled={sending}>
                <Trash2 className="size-4" />
              </IconButton>
              <button
                type="button"
                onClick={sendVoice}
                disabled={sending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink disabled:opacity-60"
              >
                {sending ? <Spinner className="text-current" /> : <SendHorizontal className="size-4" />} Send
              </button>
            </>
          )
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line-strong bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            sendText();
          }
        }}
        rows={1}
        maxLength={4000}
        placeholder="Write a message…"
        aria-label="Message"
        className="block max-h-40 min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
      <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
        <IconButton label="Attach file" onClick={() => fileInput.current?.click()} disabled={sending}>
          <Paperclip className="size-4" />
        </IconButton>
        <IconButton
          label="Record voice note"
          disabled={sending}
          onClick={async () => {
            const ok = await rec.start();
            if (!ok && rec.error) toast.error(rec.error);
            else if (!ok) toast.error('Microphone permission was denied. Allow microphone access in your browser settings.');
          }}
        >
          <Mic className="size-4" />
        </IconButton>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
        <span className="flex-1" />
        {sending && <Spinner className="mr-2" />}
        <button
          type="button"
          onClick={sendText}
          disabled={!text.trim() || sending}
          aria-label="Send message"
          className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-accent-ink transition-opacity disabled:opacity-30"
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
