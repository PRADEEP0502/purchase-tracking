export type Priority = 'normal' | 'high' | 'urgent';
export type Status = 'pending' | 'completed';
export type TaskStage = 'new' | 'assigned' | 'acknowledged' | 'in_progress' | 'completed';
export type AlertLevel = 'normal' | 'high' | 'urgent';

/** Structured details attached to assignment alerts and reminders. */
export interface AlertData {
  title?: string;
  label?: string;
  /** Number of tasks when one alert covers a multi-item order. */
  count?: number;
  structurePath?: string[];
  action?: string | null;
  priority?: Priority;
  assignedBy?: string | null;
  dueDate?: string | null;
  reminder?: number;
  maxReminders?: number;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'user';
  sectionIds: number[];
}

export interface Section {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  pendingCount: number;
}

/** A node in the admin-defined hierarchy (any depth; parentId null = top level). */
export interface TaskStructure {
  id: number;
  name: string;
  parentId: number | null;
  isActive: boolean;
  sortOrder: number;
  taskCount: number;
  childCount: number;
}

export interface TaskAction {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  taskCount: number;
}

export interface UserSummary {
  id: number;
  name: string;
  role: 'admin' | 'user';
  isActive: boolean;
  sectionIds: number[];
  email?: string;
  phone?: string | null;
}

export interface TaskPermissions {
  edit: boolean;
  acknowledge: boolean;
  start: boolean;
  assign: boolean;
  close: boolean;
  reopen: boolean;
  delete: boolean;
  comment: boolean;
}

export interface Task {
  id: number;
  title: string;
  quantity: number;
  unit: string;
  description: string | null;
  priority: Priority;
  status: Status;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  sectionId: number | null;
  sectionName: string | null;
  /** Deepest selected structure. */
  structureId: number | null;
  structureName: string | null;
  parentStructureId: number | null;
  parentStructureName: string | null;
  /** Root-first names, e.g. ["Parent", "Child"]. Empty when no structure is set. */
  structurePath: string[];
  actionId: number | null;
  actionName: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
  createdBy: number;
  creatorName: string | null;
  closedBy: number | null;
  closerName: string | null;
  assignedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: number | null;
  acknowledgedByName: string | null;
  startedAt: string | null;
  /** Work stage derived on the server: new → assigned → acknowledged → in progress → completed. */
  stage: TaskStage;
  attachmentCount: number;
  commentCount: number;
  voiceNoteCount: number;
  permissions: TaskPermissions;
}

export interface Attachment {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  url: string;
  uploadedBy: number;
  uploaderName: string;
  canDelete: boolean;
}

export interface TaskDetail extends Task {
  attachments: Attachment[];
}

export type ThreadItem =
  | { kind: 'comment'; id: number; userId: number; userName: string; message: string; createdAt: string }
  | { kind: 'voice'; id: number; userId: number; userName: string; duration: number; createdAt: string; url: string }
  | {
      kind: 'attachment';
      id: number;
      userId: number;
      userName: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      createdAt: string;
      url: string;
    };

export interface ActivityEntry {
  id: number;
  action: string;
  metadata: Record<string, any>;
  createdAt: string;
  userName: string | null;
  taskId?: number | null;
  taskTitle?: string | null;
}

export interface Notification {
  id: number;
  taskId: number | null;
  type: string;
  message: string;
  level: AlertLevel;
  data: AlertData;
  readAt: string | null;
  createdAt: string;
}

export interface Dashboard {
  counts: {
    total: number;
    pending: number;
    urgent: number;
    completed: number;
    overdue: number;
    mine: number;
    awaitingAck: number;
    inbox: number;
    completedToday: number;
  };
  sections: Array<{ id: number; name: string; icon: string | null; pending: number; urgent: number }>;
}

export interface ParsedPurchase {
  transcript: string;
  title: string | null;
  quantity: number | null;
  unit: string;
  section: { id: number; name: string } | null;
  assignee: { id: number; name: string } | null;
  structure: { id: number; name: string; path: string[] } | null;
  action: { id: number; name: string } | null;
  priority: Priority;
  dueDate: string | null;
  unmatched: { section?: string; person?: string; structure?: string };
  missing: Array<'title' | 'quantity' | 'section' | 'assignee'>;
  confident: boolean;
}

export interface TaskPage {
  data: Task[];
  meta: { total: number; page: number; pageSize: number; hasMore: boolean };
}
