import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useAuth } from '../auth';
import { api, errorMessage } from '../lib/api';
import { cx } from '../lib/format';
import { useStructures } from '../lib/queries';
import type { TaskStructure } from '../lib/types';
import { Popover } from './Popover';
import { Field, Spinner } from './ui';

/** Generic labels — the hierarchy means whatever the business decides. */
export function levelLabel(level: number): string {
  return level === 0 ? 'Structure' : level === 1 ? 'Child structure' : `Level ${level + 1}`;
}

/** Root-first chain from the top-level structure down to `id`. */
export function chainOf(list: TaskStructure[] | undefined, id: number | null | undefined): TaskStructure[] {
  if (!list || !id) return [];
  const byId = new Map(list.map((s) => [s.id, s]));
  const out: TaskStructure[] = [];
  const seen = new Set<number>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    out.unshift(cur);
  }
  return out;
}

function Combo({
  label,
  options,
  selected,
  onSelect,
  onCreate,
  autoOpen,
}: {
  label: string;
  options: TaskStructure[];
  selected: TaskStructure | undefined;
  onSelect: (id: number | null) => void;
  onCreate?: (name: string) => Promise<void>;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  const exact = options.some((o) => o.name.toLowerCase() === needle);
  const canCreate = !!onCreate && !!needle && !exact;
  const total = filtered.length + (canCreate ? 1 : 0);

  const choose = async (index: number, close: () => void) => {
    if (index < filtered.length) {
      onSelect(filtered[index].id);
      close();
    } else if (canCreate && onCreate) {
      setCreating(true);
      try {
        await onCreate(q.trim());
        close();
      } finally {
        setCreating(false);
      }
    }
  };

  return (
    <Field label={label}>
      <Popover
        align="start"
        width={300}
        open={open}
        onOpenChange={setOpen}
        trigger={({ ref, toggle }) => (
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={cx(
                'flex h-9 w-full items-center gap-2 rounded-md border border-line-strong bg-surface pr-8 pl-3 text-left text-sm transition-colors hover:border-ink-3/60 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none',
                open && 'border-accent ring-2 ring-accent/20',
              )}
            >
              <span className={cx('min-w-0 flex-1 truncate', !selected && 'text-ink-3')}>{selected?.name ?? 'Select or search…'}</span>
            </button>
            {selected ? (
              <button
                type="button"
                aria-label={`Clear ${label}`}
                onClick={() => onSelect(null)}
                className="absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-subtle hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" />
            )}
          </div>
        )}
      >
        {(close) => (
          <>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-ink-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, total - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (total) choose(active, close);
                  }
                }}
                placeholder={onCreate ? 'Search or type a new name…' : 'Search…'}
                aria-label={`Search ${label}`}
                className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
            </div>
            <ul role="listbox" className="scroll-thin max-h-64 overflow-y-auto py-1">
              {filtered.map((o, i) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === selected?.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(i, close)}
                    className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === active ? 'bg-subtle' : '')}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {o.childCount > 0 && <span className="text-xs text-ink-3">{o.childCount} below</span>}
                    {o.id === selected?.id && <Check className="size-4 text-accent" />}
                  </button>
                </li>
              ))}
              {canCreate && (
                <li>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(filtered.length)}
                    onClick={() => choose(filtered.length, close)}
                    disabled={creating}
                    className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-accent', active === filtered.length && 'bg-subtle')}
                  >
                    {creating ? <Spinner className="text-accent" /> : <Plus className="size-4" />}
                    Add “{q.trim()}”
                  </button>
                </li>
              )}
              {!total && <li className="px-3 py-3 text-sm text-ink-3">{options.length ? 'No match.' : 'Nothing here yet.'}</li>}
            </ul>
          </>
        )}
      </Popover>
    </Field>
  );
}

/**
 * Cascading selector for the generic structure hierarchy. The value is the deepest selected
 * structure. Deeper levels only appear when the selected structure has children; admins can
 * create structures inline. Always optional.
 */
export function StructurePicker({ value, onChange, className }: { value: number | null; onChange: (id: number | null) => void; className?: string }) {
  const structures = useStructures();
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  const [addingChildOf, setAddingChildOf] = useState<number | null>(null);

  const list = structures.data;
  const chain = useMemo(() => chainOf(list, value), [list, value]);
  const childrenOf = (parentId: number | null) => (list ?? []).filter((s) => s.parentId === parentId);

  const create = async (name: string, parentId: number | null) => {
    try {
      const { data } = await api.post<TaskStructure>('/structures', { name, parentId });
      await qc.invalidateQueries({ queryKey: ['structures'] });
      setAddingChildOf(null);
      onChange(data.id);
      toast.success(`Added “${data.name}”`);
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to add structure.'));
      throw e;
    }
  };

  if (structures.isPending) return null;
  // Nothing configured and the user cannot create: hide the field entirely.
  if (!list?.length && !admin) return null;

  const levels: Array<{ parentId: number | null; selected?: TaskStructure; autoOpen?: boolean }> = [{ parentId: null, selected: chain[0] }];
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const hasChildren = childrenOf(node.id).length > 0;
    if (hasChildren || addingChildOf === node.id) {
      levels.push({ parentId: node.id, selected: chain[i + 1], autoOpen: addingChildOf === node.id });
    }
  }
  const last = chain[chain.length - 1];
  const canAddChild = admin && last && !childrenOf(last.id).length && addingChildOf !== last.id;

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        {levels.map((lvl, i) => (
          <Combo
            key={`${i}-${lvl.parentId}`}
            label={levelLabel(i)}
            options={childrenOf(lvl.parentId)}
            selected={lvl.selected}
            autoOpen={lvl.autoOpen}
            onSelect={(id) => {
              setAddingChildOf(null);
              // Clearing a level falls back to its parent.
              onChange(id ?? lvl.parentId);
            }}
            onCreate={admin ? (name) => create(name, lvl.parentId) : undefined}
          />
        ))}
      </div>
      {canAddChild && (
        <button type="button" onClick={() => setAddingChildOf(last.id)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          <Plus className="size-3" /> Add child structure under {last.name}
        </button>
      )}
    </div>
  );
}
