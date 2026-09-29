import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Flag, Mic, Paperclip, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { errorMessage, ApiError } from '../lib/api';
import { cx, fileSize, taskLabel, UNITS, PRIORITY_LABEL } from '../lib/format';
import { useCreateTask, useSections, useUpdateTask, useUsers, type TaskInput } from '../lib/queries';
import type { Priority } from '../lib/types';
import { useAppState } from './app-state';
import { Button, Dialog, Field, Input, Kbd, Select, Textarea } from './ui';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

export function checkFiles(files: File[]): string | null {
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return `File upload failed. “${big.name}” is larger than the maximum file size of 10 MB.`;
  if (files.length > 10) return 'You can attach up to 10 files at a time.';
  return null;
}

const empty: TaskInput = {
  title: '',
  quantity: NaN,
  unit: 'Nos',
  description: null,
  sectionId: null,
  assignedTo: null,
  priority: 'normal',
  dueDate: null,
};

/** "Bearing – 2 Nos" / "Bearing 2 nos" typed into the item field → split out quantity and unit. */
function splitQuantity(title: string): { title: string; quantity: number; unit: string } | null {
  const m = /^(.*?\S)\s*[–—-]?\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\.?$/.exec(title.trim());
  if (!m) return null;
  const unitRaw = m[3]?.toLowerCase();
  const unit = unitRaw ? UNITS.find((u) => u.toLowerCase() === unitRaw || `${u.toLowerCase()}s` === unitRaw || (u === 'Nos' && ['no', 'nos', 'pcs', 'pc'].includes(unitRaw)) || (u === 'M' && ['m', 'mtr', 'meter', 'meters', 'metre'].includes(unitRaw)) || (u === 'Kg' && ['kg', 'kgs', 'kilo'].includes(unitRaw)) || (u === 'L' && ['l', 'ltr', 'litre', 'liter'].includes(unitRaw)) || (u === 'Packets' && ['packet', 'pkt', 'pack'].includes(unitRaw))) : 'Nos';
  if (!unit) return null;
  return { title: m[1].replace(/[–—-]\s*$/, '').trim(), quantity: Number(m[2]), unit };
}

export function TaskFormDialog() {
  const { createOpen, createPrefill, editing, closeCreate, openTask, openVoice } = useAppState();
  const location = useLocation();
  const sections = useSections();
  const users = useUsers();
  const create = useCreateTask();
  const update = useUpdateTask(editing?.id ?? 0);
  const [form, setForm] = useState<TaskInput>(empty);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!createOpen) return;
    setErrors({});
    setFiles([]);
    if (editing) {
      setForm({
        title: editing.title,
        quantity: editing.quantity,
        unit: editing.unit,
        description: editing.description,
        sectionId: editing.sectionId,
        assignedTo: editing.assignedTo,
        priority: editing.priority,
        dueDate: editing.dueDate,
      });
      setShowMore(!!(editing.description || editing.dueDate));
    } else {
      // Default the section to the one being viewed.
      const m = /^\/sections\/(\d+)/.exec(location.pathname);
      const sectionId = createPrefill?.sectionId ?? (m ? Number(m[1]) : null);
      setForm({ ...empty, ...createPrefill, sectionId });
      setShowMore(!!(createPrefill?.description || createPrefill?.dueDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Enter what needs to be purchased.';
    if (!Number.isFinite(form.quantity) || form.quantity <= 0) e.quantity = 'Enter a quantity.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;
    const input: TaskInput = { ...form, title: form.title.trim(), description: form.description?.trim() || null };
    try {
      if (editing) {
        await update.mutateAsync(input);
        toast.success('Task updated');
        closeCreate();
      } else {
        const { task, uploadError } = await create.mutateAsync({ input, files, source: createPrefill?.source ?? 'form' });
        closeCreate();
        toast.success('Task created successfully', {
          description: taskLabel(task),
          action: { label: 'Open', onClick: () => openTask(task.id) },
        });
        if (uploadError) toast.error(errorMessage(uploadError, 'File upload failed. Please attach it again from the task.'));
      }
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(errorMessage(e, editing ? 'Unable to update task. Please try again.' : 'Unable to create task. Please try again.'));
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const err = checkFiles(next);
    if (err) return toast.error(err);
    setFiles(next);
  };

  const busy = create.isPending || update.isPending;
  const activeSections = sections.data?.filter((s) => s.isActive) ?? [];

  return (
    <Dialog
      open={createOpen}
      onClose={closeCreate}
      title={editing ? 'Edit purchase task' : 'Add purchase'}
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-xs text-ink-3 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
            to save
          </span>
          <Button onClick={closeCreate}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {editing ? 'Save changes' : 'Create Task'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
        }}
        className="space-y-4 px-5 py-4"
        noValidate
      >
        <div>
          <label htmlFor="task-title" className="mb-1.5 block text-[13px] font-medium text-ink-2">
            What needs to be purchased?<span className="ml-0.5 text-urgent">*</span>
          </label>
          <input
            id="task-title"
            ref={titleRef}
            data-autofocus
            value={form.title}
            maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            onBlur={() => {
              if (Number.isFinite(form.quantity)) return;
              const s = splitQuantity(form.title);
              if (s) setForm((f) => ({ ...f, ...s }));
            }}
            placeholder="e.g. Bearing – 2 Nos"
            className={cx(
              'h-11 w-full rounded-md border bg-surface px-3 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-ink-3 focus:ring-2 focus:outline-none',
              errors.title ? 'border-urgent focus:ring-urgent/20' : 'border-line-strong focus:border-accent focus:ring-accent/20',
            )}
            autoComplete="off"
          />
          {errors.title && <p className="mt-1 text-xs text-urgent">{errors.title}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required error={errors.quantity}>
            <div className="flex">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={Number.isFinite(form.quantity) ? form.quantity : ''}
                onChange={(e) => set('quantity', e.target.value === '' ? NaN : Number(e.target.value))}
                invalid={!!errors.quantity}
                className="rounded-r-none"
                placeholder="0"
              />
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="w-28 rounded-l-none border-l-0" aria-label="Unit">
                {(UNITS.includes(form.unit) ? UNITS : [form.unit, ...UNITS]).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Priority">
            <div className="grid h-9 grid-cols-3 overflow-hidden rounded-md border border-line-strong">
              {(['normal', 'high', 'urgent'] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('priority', p)}
                  aria-pressed={form.priority === p}
                  className={cx(
                    'inline-flex items-center justify-center gap-1 border-l border-line-strong text-[13px] font-medium first:border-l-0',
                    form.priority === p
                      ? p === 'urgent'
                        ? 'bg-urgent-soft text-urgent'
                        : p === 'high'
                          ? 'bg-high-soft text-high'
                          : 'bg-subtle text-ink'
                      : 'text-ink-3 hover:bg-subtle',
                  )}
                >
                  <Flag className="size-3" fill={form.priority === p && p !== 'normal' ? 'currentColor' : 'none'} />
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Section" error={errors.sectionId} hint={!form.sectionId ? 'Goes to Inbox if not selected' : undefined}>
            <Select value={form.sectionId ?? ''} onChange={(e) => set('sectionId', e.target.value ? Number(e.target.value) : null)} invalid={!!errors.sectionId}>
              <option value="">Select section</option>
              {activeSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {editing?.sectionId && !activeSections.some((s) => s.id === editing.sectionId) && <option value={editing.sectionId}>{editing.sectionName} (disabled)</option>}
            </Select>
          </Field>
          <Field label="Assign to" error={errors.assignedTo}>
            <Select
              value={form.assignedTo ?? ''}
              onChange={(e) => set('assignedTo', e.target.value ? Number(e.target.value) : null)}
              invalid={!!errors.assignedTo}
              disabled={!!editing && !editing.permissions.assign}
            >
              <option value="">Unassigned</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {showMore ? (
          <>
            <Field label="Due date" error={errors.dueDate}>
              <Input type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} className="max-w-[200px]" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Optional — specification, make, reason…" maxLength={4000} rows={3} />
            </Field>
          </>
        ) : (
          <button type="button" onClick={() => setShowMore(true)} className="text-[13px] font-medium text-accent hover:underline">
            + Due date & description
          </button>
        )}

        {!editing && (
          <div>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<Paperclip className="size-3.5" />} onClick={() => fileInput.current?.click()}>
                Add attachment
              </Button>
              <span className="text-xs text-ink-3">Images, PDF, documents · max 10 MB</span>
            </div>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px]">
                    <Paperclip className="size-3.5 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-ink-3">{fileSize(f.size)}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-ink-3 hover:text-ink">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!editing && createPrefill?.source !== 'voice' && (
          <button
            type="button"
            onClick={() => {
              closeCreate();
              openVoice();
            }}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-[13px] text-ink-2 hover:border-accent hover:text-accent"
          >
            <Mic className="size-4" />
            Speak instead — “Maintenance-ku rendu bearing urgent-ah venum”
          </button>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
