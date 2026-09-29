export type Priority = 'normal' | 'high' | 'urgent';
export type Status = 'pending' | 'completed';

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
  assignedTo: number | null;
  assigneeName: string | null;
  createdBy: number;
  creatorName: string | null;
  closedBy: number | null;
  closerName: string | null;
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
  priority: Priority;
  dueDate: string | null;
  unmatched: { section?: string; person?: string };
  missing: Array<'title' | 'quantity' | 'section' | 'assignee'>;
  confident: boolean;
}

export interface TaskPage {
  data: Task[];
  meta: { total: number; page: number; pageSize: number; hasMore: boolean };
}
