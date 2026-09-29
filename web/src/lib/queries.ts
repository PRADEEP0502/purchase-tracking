import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from './api';
import type {
  ActivityEntry,
  Dashboard,
  Me,
  Notification,
  Priority,
  Section,
  Task,
  TaskDetail,
  TaskPage,
  ThreadItem,
  UserSummary,
} from './types';

export interface TaskQuery {
  view?: 'inbox' | 'mine' | 'all' | 'priority' | 'completed';
  status?: string[];
  section?: Array<number | 'none'>;
  assignee?: Array<number | 'me' | 'none'>;
  priority?: Priority[];
  createdBy?: Array<number | 'me'>;
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  closedFrom?: string;
  closedTo?: string;
  due?: 'today' | 'upcoming' | 'overdue';
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me | null>('/auth/me').then((r) => r.data),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useTasks(query: TaskQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['tasks', query],
    queryFn: ({ pageParam, signal }) =>
      api
        .get<Task[]>(`/tasks${qs({ ...(query as Record<string, any>), page: pageParam, pageSize: 30 })}`, signal)
        .then((r) => r as unknown as TaskPage),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: ({ signal }) => api.get<TaskDetail>(`/tasks/${id}`, signal).then((r) => r.data),
    enabled: !!id,
    retry: (count, err: any) => err?.status !== 404 && count < 2,
  });
}

export function useThread(id: number | null) {
  return useQuery({
    queryKey: ['thread', id],
    queryFn: ({ signal }) => api.get<ThreadItem[]>(`/tasks/${id}/thread`, signal).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTaskActivity(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', id],
    queryFn: ({ signal }) => api.get<ActivityEntry[]>(`/tasks/${id}/activity`, signal).then((r) => r.data),
    enabled: !!id && enabled,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard').then((r) => r.data) });
}

export function useSections(includeInactive = false) {
  return useQuery({
    queryKey: ['sections', includeInactive],
    queryFn: () => api.get<Section[]>(`/sections${includeInactive ? '?all=1' : ''}`).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useUsers(includeInactive = false) {
  return useQuery({
    queryKey: ['users', includeInactive],
    queryFn: () => api.get<UserSummary[]>(`/users${includeInactive ? '?all=1' : ''}`).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications').then((r) => ({ items: r.data, unread: r.meta.unread as number })),
    refetchInterval: 120_000,
  });
}

/** Invalidate everything derived from task data after a change. */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return (taskId?: number) => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['sections'] });
    if (taskId) {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['activity', taskId] });
      qc.invalidateQueries({ queryKey: ['thread', taskId] });
    }
  };
}

export interface TaskInput {
  title: string;
  quantity: number;
  unit: string;
  description: string | null;
  sectionId: number | null;
  assignedTo: number | null;
  priority: Priority;
  dueDate: string | null;
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ input, files, source }: { input: TaskInput; files: File[]; source: 'form' | 'voice' }) =>
      api.post<Task>('/tasks', { ...input }, { 'x-jpm-source': source }).then(async (r) => {
        let uploadError: unknown = null;
        if (files.length) {
          const fd = new FormData();
          files.forEach((f) => fd.append('files', f));
          try {
            await api.post(`/tasks/${r.data.id}/attachments`, fd);
          } catch (e) {
            uploadError = e;
          }
        }
        return { task: r.data, uploadError };
      }),
    onSuccess: ({ task }) => invalidate(task.id),
  });
}

export function useUpdateTask(id: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: Partial<TaskInput>) => api.patch<Task>(`/tasks/${id}`, input as Record<string, unknown>).then((r) => r.data),
    onSuccess: () => invalidate(id),
  });
}

export function useTaskAction() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'close' | 'reopen' | 'delete' }) =>
      action === 'delete' ? api.del(`/tasks/${id}`) : api.post<Task>(`/tasks/${id}/${action}`),
    onSuccess: (_d, { id }) => invalidate(id),
  });
}
