import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { taskLabel } from '../lib/format';
import { useInvalidateTasks, type TaskInput } from '../lib/queries';
import type { Task } from '../lib/types';

export interface CreatePrefill extends Partial<TaskInput> {
  source?: 'form' | 'voice';
}

interface AppState {
  createOpen: boolean;
  createPrefill: CreatePrefill | null;
  /** Task being edited in the task form, or null when creating. */
  editing: Task | null;
  openCreate: (prefill?: CreatePrefill) => void;
  openEdit: (task: Task) => void;
  closeCreate: () => void;
  voiceOpen: boolean;
  openVoice: () => void;
  closeVoice: () => void;
  taskId: number | null;
  openTask: (id: number) => void;
  closeTask: () => void;
  /** Todoist-style quick close: the task is closed after a short undo window. */
  quickClose: (task: Task) => void;
  closingIds: Set<number>;
}

const Ctx = createContext<AppState | null>(null);

const UNDO_MS = 4000;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<CreatePrefill | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [closingIds, setClosingIds] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, number>());
  const invalidate = useInvalidateTasks();

  const taskParam = Number(params.get('task'));
  const taskId = Number.isInteger(taskParam) && taskParam > 0 ? taskParam : null;

  const openTask = useCallback(
    (id: number) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('task', String(id));
        return n;
      }),
    [setParams],
  );
  const closeTask = useCallback(
    () =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('task');
        return n;
      }),
    [setParams],
  );

  const setClosing = (id: number, on: boolean) =>
    setClosingIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const quickClose = useCallback(
    (task: Task) => {
      if (timers.current.has(task.id)) return;
      setClosing(task.id, true);
      const label = taskLabel(task);
      const timer = window.setTimeout(async () => {
        timers.current.delete(task.id);
        try {
          await api.post(`/tasks/${task.id}/close`);
          invalidate(task.id);
        } catch (e) {
          toast.error(errorMessage(e, 'Unable to close task. Please try again.'));
        } finally {
          setClosing(task.id, false);
        }
      }, UNDO_MS);
      timers.current.set(task.id, timer);
      toast.success(`Closed ${label}`, {
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            window.clearTimeout(timers.current.get(task.id));
            timers.current.delete(task.id);
            setClosing(task.id, false);
          },
        },
      });
    },
    [invalidate],
  );

  const value = useMemo<AppState>(
    () => ({
      createOpen,
      createPrefill,
      editing,
      openCreate: (prefill) => {
        setEditing(null);
        setCreatePrefill(prefill ?? null);
        setCreateOpen(true);
      },
      openEdit: (task) => {
        setEditing(task);
        setCreatePrefill(null);
        setCreateOpen(true);
      },
      closeCreate: () => setCreateOpen(false),
      voiceOpen,
      openVoice: () => setVoiceOpen(true),
      closeVoice: () => setVoiceOpen(false),
      taskId,
      openTask,
      closeTask,
      quickClose,
      closingIds,
    }),
    [createOpen, createPrefill, editing, voiceOpen, taskId, openTask, closeTask, quickClose, closingIds],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState outside provider');
  return v;
}
