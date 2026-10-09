import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Boxes, ChevronRight, PencilLine, Plus, Tag, Trash2 } from 'lucide-react';
import { ActionBadge } from '../components/task-bits';
import { Button, Dialog, EmptyState, ErrorState, Field, IconButton, Input, ListSkeleton } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { cx } from '../lib/format';
import { useActions, useStructures } from '../lib/queries';
import type { TaskStructure } from '../lib/types';

function useRefreshCatalog() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['structures'] });
    qc.invalidateQueries({ queryKey: ['actions'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task'] });
  };
}

/** Small dialog used for both "add" and "rename" of structures and actions. */
function NameDialog({
  open,
  title,
  label,
  initial,
  hint,
  submitLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  hint?: ReactNode;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError('Enter a name.');
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        {hint && <p className="text-sm text-ink-2">{hint}</p>}
        <Field label={label} required error={error ?? undefined}>
          <Input data-autofocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

type StructureDialog = { mode: 'add'; parent: TaskStructure | null } | { mode: 'rename'; node: TaskStructure } | null;

export function StructureSettings() {
  const structures = useStructures(true);
  const refresh = useRefreshCatalog();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<StructureDialog>(null);
  const [busy, setBusy] = useState(false);
  const list = structures.data ?? [];
  const childrenOf = (id: number | null) => list.filter((s) => s.parentId === id);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const move = (node: TaskStructure, delta: number) => {
    const siblings = childrenOf(node.parentId);
    const i = siblings.findIndex((s) => s.id === node.id);
    const j = i + delta;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api.post('/structures/reorder', { ids }));
  };

  const renderNode = (node: TaskStructure, depth: number, index: number, siblings: TaskStructure[]): ReactNode => {
    const kids = childrenOf(node.id);
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id}>
        <div className={cx('group flex items-center gap-2 py-2 pr-3', !node.isActive && 'bg-canvas')} style={{ paddingLeft: 12 + depth * 22 }}>
          <button
            type="button"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            disabled={!kids.length}
            onClick={() =>
              setCollapsed((c) => {
                const n = new Set(c);
                if (n.has(node.id)) n.delete(node.id);
                else n.add(node.id);
                return n;
              })
            }
            className={cx('flex size-5 items-center justify-center rounded text-ink-3 hover:bg-subtle', !kids.length && 'invisible')}
          >
            <ChevronRight className={cx('size-4 transition-transform', open && 'rotate-90')} />
          </button>
          <div className="min-w-0 flex-1">
            <p className={cx('truncate text-sm', depth === 0 ? 'font-semibold' : 'font-medium', !node.isActive && 'text-ink-3')}>
              {node.name}
              {!node.isActive && <span className="ml-2 rounded bg-muted px-1.5 py-px text-[11px] font-medium text-ink-3">Disabled</span>}
            </p>
            <p className="text-xs text-ink-3">
              {node.taskCount} task{node.taskCount === 1 ? '' : 's'}
              {kids.length > 0 && ` · ${kids.length} below`}
            </p>
          </div>
          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-60 sm:group-hover:opacity-100">
            <IconButton label={`Add child under ${node.name}`} disabled={busy} onClick={() => setDialog({ mode: 'add', parent: node })}>
              <Plus className="size-4" />
            </IconButton>
            <IconButton label={`Rename ${node.name}`} disabled={busy} onClick={() => setDialog({ mode: 'rename', node })}>
              <PencilLine className="size-4" />
            </IconButton>
            <IconButton label={`Move ${node.name} up`} disabled={busy || index === 0} onClick={() => move(node, -1)}>
              <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label={`Move ${node.name} down`} disabled={busy || index === siblings.length - 1} onClick={() => move(node, 1)}>
              <ArrowDown className="size-4" />
            </IconButton>
            {node.taskCount === 0 && node.childCount === 0 ? (
              <IconButton
                label={`Delete ${node.name}`}
                disabled={busy}
                onClick={() => run(() => api.del(`/structures/${node.id}`), `${node.name} deleted`)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            ) : (
              <span className="inline-block size-8" />
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => api.patch(`/structures/${node.id}`, { isActive: !node.isActive }), node.isActive ? `${node.name} disabled` : `${node.name} enabled`)}
            >
              {node.isActive ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
        {open && kids.length > 0 && <ul className="border-l border-line" style={{ marginLeft: 21 + depth * 22 }}>{kids.map((k, i) => renderNode(k, depth + 1, i, kids))}</ul>}
      </li>
    );
  };

  const roots = childrenOf(null);

  return (
    <div className="pb-8">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="max-w-lg text-sm text-ink-3">
          Structures give tasks their context — for example a machine and its parts, or a building and its rooms. Add as many levels as you need. Disabled
          structures are hidden when creating tasks; existing tasks keep them.
        </p>
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ mode: 'add', parent: null })}>
          Add structure
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {structures.isPending ? (
          <ListSkeleton rows={4} />
        ) : structures.isError ? (
          <ErrorState message="Unable to load structures." onRetry={() => structures.refetch()} />
        ) : !roots.length ? (
          <EmptyState
            icon={<Boxes className="size-5" />}
            title="No structures yet"
            body="Tasks work without them. Add a top-level structure, then add child structures under it."
            action={
              <Button size="sm" variant="primary" onClick={() => setDialog({ mode: 'add', parent: null })}>
                Add structure
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">{roots.map((r, i) => renderNode(r, 0, i, roots))}</ul>
        )}
      </div>

      <NameDialog
        open={dialog !== null}
        title={dialog?.mode === 'rename' ? 'Rename structure' : dialog?.parent ? 'Add child structure' : 'Add structure'}
        label="Name"
        initial={dialog?.mode === 'rename' ? dialog.node.name : ''}
        hint={dialog?.mode === 'add' && dialog.parent ? <>Under <strong className="text-ink">{dialog.parent.name}</strong></> : undefined}
        submitLabel={dialog?.mode === 'rename' ? 'Save' : 'Add'}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (!dialog) return;
          if (dialog.mode === 'rename') {
            await api.patch(`/structures/${dialog.node.id}`, { name });
            toast.success('Structure renamed');
          } else {
            await api.post('/structures', { name, parentId: dialog.parent?.id ?? null });
            if (dialog.parent) setCollapsed((c) => new Set([...c].filter((id) => id !== dialog.parent!.id)));
            toast.success(`Added ${name}`);
          }
          refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function ActionSettings() {
  const actions = useActions(true);
  const refresh = useRefreshCatalog();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'rename'; id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = actions.data ?? [];

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const move = (index: number, delta: number) => {
    const ids = list.map((a) => a.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    qc.setQueryData(['actions', true], ids.map((id) => list.find((a) => a.id === id)!));
    run(() => api.post('/actions/reorder', { ids }));
  };

  return (
    <div className="pb-8">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="max-w-lg text-sm text-ink-3">
          The kind of work a task needs. The first active action is the default for new tasks. Disabled actions stay on existing tasks.
        </p>
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ mode: 'add' })}>
          Add action
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {actions.isPending ? (
          <ListSkeleton rows={5} />
        ) : actions.isError ? (
          <ErrorState message="Unable to load actions." onRetry={() => actions.refetch()} />
        ) : !list.length ? (
          <EmptyState icon={<Tag className="size-5" />} title="No actions yet" />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((a, i) => (
              <li key={a.id} className={cx('flex items-center gap-3 px-4 py-2.5', !a.isActive && 'bg-canvas')}>
                <div className="flex flex-col">
                  <IconButton label={`Move ${a.name} up`} className="size-5" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton label={`Move ${a.name} down`} className="size-5" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                </div>
                <div className={cx('flex min-w-0 flex-1 items-center gap-2', !a.isActive && 'opacity-60')}>
                  <ActionBadge name={a.name} />
                  {!a.isActive && <span className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-ink-3">Disabled</span>}
                </div>
                <span className="tabular hidden text-xs text-ink-3 sm:inline">
                  {a.taskCount} task{a.taskCount === 1 ? '' : 's'}
                </span>
                <IconButton label={`Rename ${a.name}`} onClick={() => setDialog({ mode: 'rename', id: a.id, name: a.name })}>
                  <PencilLine className="size-4" />
                </IconButton>
                {a.taskCount === 0 ? (
                  <IconButton label={`Delete ${a.name}`} disabled={busy} onClick={() => run(() => api.del(`/actions/${a.id}`), `${a.name} deleted`)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                ) : (
                  <span className="inline-block size-8" />
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api.patch(`/actions/${a.id}`, { isActive: !a.isActive }), a.isActive ? `${a.name} disabled` : `${a.name} enabled`)}>
                  {a.isActive ? 'Disable' : 'Enable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NameDialog
        open={dialog !== null}
        title={dialog?.mode === 'rename' ? 'Rename action' : 'Add action'}
        label="Action name"
        initial={dialog?.mode === 'rename' ? dialog.name : ''}
        submitLabel={dialog?.mode === 'rename' ? 'Save' : 'Add action'}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.mode === 'rename') {
            await api.patch(`/actions/${dialog.id}`, { name });
            toast.success('Action renamed');
          } else {
            await api.post('/actions', { name });
            toast.success(`Added ${name}`);
          }
          refresh();
        }}
      />
    </div>
  );
}
