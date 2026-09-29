import { type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange, Check, ChevronDown, X } from 'lucide-react';
import { cx, fmtDateOnly, PRIORITY_LABEL } from '../lib/format';
import { useSections, useUsers, type TaskQuery } from '../lib/queries';
import type { Priority } from '../lib/types';
import { Popover } from './Popover';
import { Input } from './ui';

/**
 * Filters live in the URL so a filtered view can be bookmarked or shared.
 * Keys: status, section, assignee, priority, createdBy, createdFrom/To, dueFrom/To.
 */
export function useUrlFilters(): { query: TaskQuery; active: number; clear: () => void } {
  const [params, setParams] = useSearchParams();
  const list = (k: string) => params.get(k)?.split(',').filter(Boolean) ?? [];
  const num = (k: string) => list(k).map((v) => (v === 'none' || v === 'me' ? v : Number(v))) as any[];
  const query: TaskQuery = {
    status: list('status'),
    section: num('section'),
    assignee: num('assignee'),
    priority: list('priority') as Priority[],
    createdBy: num('createdBy'),
    createdFrom: params.get('createdFrom') ?? undefined,
    createdTo: params.get('createdTo') ?? undefined,
    dueFrom: params.get('dueFrom') ?? undefined,
    dueTo: params.get('dueTo') ?? undefined,
  };
  const keys = ['status', 'section', 'assignee', 'priority', 'createdBy', 'createdFrom', 'createdTo', 'dueFrom', 'dueTo'];
  const active = new Set(keys.filter((k) => params.get(k)).map((k) => k.replace(/From|To$/, ''))).size;
  const clear = () =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      keys.forEach((k) => n.delete(k));
      return n;
    });
  return { query, active, clear };
}

function useParam(key: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key)?.split(',').filter(Boolean) ?? [];
  const set = (next: string[]) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (next.length) n.set(key, next.join(','));
        else n.delete(key);
        return n;
      },
      { replace: true },
    );
  return [value, set] as const;
}

function Chip({ label, summary, active, open, onClick, onClear, chipRef }: { label: string; summary?: string; active: boolean; open: boolean; onClick: () => void; onClear: () => void; chipRef: (el: HTMLElement | null) => void }) {
  return (
    <span
      ref={chipRef}
      className={cx(
        'inline-flex h-8 shrink-0 items-center rounded-md border text-[13px] transition-colors',
        active ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line-strong bg-surface text-ink-2 hover:bg-subtle',
        open && !active && 'bg-subtle',
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex h-full items-center gap-1.5 pr-1.5 pl-2.5">
        <span className={cx(active && 'font-medium')}>{label}</span>
        {summary && <span className="max-w-[140px] truncate font-medium">: {summary}</span>}
        {!active && <ChevronDown className="size-3.5 opacity-60" />}
      </button>
      {active && (
        <button type="button" aria-label={`Clear ${label} filter`} onClick={onClear} className="mr-1 inline-flex size-5 items-center justify-center rounded hover:bg-accent/15">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function MultiFilter({ label, param, options }: { label: string; param: string; options: Array<{ value: string; label: ReactNode; text: string }> }) {
  const [value, set] = useParam(param);
  const selected = options.filter((o) => value.includes(o.value));
  const summary = selected.length === 1 ? selected[0].text : selected.length > 1 ? `${selected.length} selected` : undefined;
  return (
    <Popover
      align="start"
      width={220}
      trigger={({ toggle, ref, open }) => <Chip chipRef={ref} label={label} summary={summary} active={value.length > 0} open={open} onClick={toggle} onClear={() => set([])} />}
    >
      {() => (
        <div className="scroll-thin overflow-y-auto py-1">
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => set(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-subtle"
              >
                <span className={cx('flex size-4 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

function DateFilter({ label, prefix }: { label: string; prefix: 'created' | 'due' }) {
  const [from, setFrom] = useParam(`${prefix}From`);
  const [to, setTo] = useParam(`${prefix}To`);
  const f = from[0];
  const t = to[0];
  const summary = f && t ? `${fmtDateOnly(f)} – ${fmtDateOnly(t)}` : f ? `from ${fmtDateOnly(f)}` : t ? `until ${fmtDateOnly(t)}` : undefined;
  return (
    <Popover
      align="start"
      width={260}
      trigger={({ toggle, ref, open }) => (
        <Chip
          chipRef={ref}
          label={label}
          summary={summary}
          active={!!(f || t)}
          open={open}
          onClick={toggle}
          onClear={() => {
            setFrom([]);
            setTo([]);
          }}
        />
      )}
    >
      {() => (
        <div className="space-y-2 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
            <CalendarRange className="size-3.5" /> {label}
          </p>
          <label className="block text-xs text-ink-2">
            From
            <Input type="date" value={f ?? ''} max={t} onChange={(e) => setFrom(e.target.value ? [e.target.value] : [])} className="mt-1" />
          </label>
          <label className="block text-xs text-ink-2">
            To
            <Input type="date" value={t ?? ''} min={f} onChange={(e) => setTo(e.target.value ? [e.target.value] : [])} className="mt-1" />
          </label>
        </div>
      )}
    </Popover>
  );
}

export function FilterBar({ hide = [] }: { hide?: Array<'status' | 'section' | 'assignee' | 'priority' | 'createdBy' | 'created' | 'due'> }) {
  const sections = useSections();
  const users = useUsers();
  const { active, clear } = useUrlFilters();
  const people = (users.data ?? []).map((u) => ({ value: String(u.id), label: u.name, text: u.name }));
  const show = (k: (typeof hide)[number]) => !hide.includes(k);

  return (
    <div className="scroll-thin -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
      {show('status') && (
        <MultiFilter
          label="Status"
          param="status"
          options={[
            { value: 'pending', label: 'Pending', text: 'Pending' },
            { value: 'completed', label: 'Completed', text: 'Completed' },
          ]}
        />
      )}
      {show('section') && (
        <MultiFilter
          label="Section"
          param="section"
          options={[...(sections.data ?? []).map((s) => ({ value: String(s.id), label: s.name, text: s.name })), { value: 'none', label: <span className="italic">No section</span>, text: 'No section' }]}
        />
      )}
      {show('assignee') && <MultiFilter label="Assigned to" param="assignee" options={[...people, { value: 'none', label: <span className="italic">Unassigned</span>, text: 'Unassigned' }]} />}
      {show('priority') && (
        <MultiFilter
          label="Priority"
          param="priority"
          options={(['urgent', 'high', 'normal'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p], text: PRIORITY_LABEL[p] }))}
        />
      )}
      {show('created') && <DateFilter label="Created" prefix="created" />}
      {show('due') && <DateFilter label="Due" prefix="due" />}
      {show('createdBy') && <MultiFilter label="Created by" param="createdBy" options={people} />}
      {active > 0 && (
        <button onClick={clear} className="ml-1 shrink-0 text-[13px] font-medium text-ink-3 hover:text-ink">
          Clear all
        </button>
      )}
    </div>
  );
}
