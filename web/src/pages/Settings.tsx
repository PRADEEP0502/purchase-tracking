import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Monitor, Moon, PencilLine, Plus, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useAuth } from '../auth';
import { PageHeader, Panel } from '../components/Page';
import { SECTION_ICONS, SectionIcon } from '../components/task-bits';
import { Avatar, Button, Dialog, ErrorState, Field, IconButton, Input, Kbd, ListSkeleton, Select, Textarea } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { cx } from '../lib/format';
import { useSections, useUsers } from '../lib/queries';
import { useTheme, type ThemePref } from '../lib/theme';
import type { Section, UserSummary } from '../lib/types';

export function SettingsPage() {
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  const tab = ({ isActive }: { isActive: boolean }) =>
    cx('inline-flex h-9 items-center border-b-2 px-1 text-sm font-medium', isActive ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink');

  return (
    <Panel>
      <PageHeader title="Settings" icon={<SettingsIcon className="size-5" />}>
        <nav className="flex gap-5 border-b border-line">
          <NavLink to="/settings" end className={tab}>
            Profile
          </NavLink>
          {admin && (
            <NavLink to="/settings/sections" className={tab}>
              Sections
            </NavLink>
          )}
          {admin && (
            <NavLink to="/settings/users" className={tab}>
              Users
            </NavLink>
          )}
        </nav>
      </PageHeader>
      <div className="px-4 sm:px-5">
        <Routes>
          <Route index element={<ProfileSettings />} />
          <Route path="sections" element={admin ? <SectionSettings /> : <Navigate to="/settings" replace />} />
          <Route path="users" element={admin ? <UserSettings /> : <Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </Panel>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ProfileSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pref, setTheme } = useTheme();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'profile' | 'password' | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving('profile');
    try {
      const { data } = await api.patch('/auth/me', { name: name.trim(), phone: phone.trim() || null });
      qc.setQueryData(['me'], data);
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (pw.next.length < 8) return setErrors({ newPassword: 'New password must be at least 8 characters.' });
    setSaving('password');
    try {
      await api.patch('/auth/me', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '' });
      toast.success('Password changed');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const themes: Array<{ value: ThemePref; label: string; icon: React.ReactNode }> = [
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
  ];

  return (
    <div className="space-y-5 pb-8">
      <Card title="Profile">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" />
          </Field>
          <Field label="Email" hint="Ask an admin to change your email.">
            <Input value={user?.email ?? ''} disabled />
          </Field>
          <div className="flex items-end justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={saving === 'profile'} disabled={!name.trim()}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Appearance">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={pref === t.value}
              onClick={() => setTheme(t.value)}
              className={cx('inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm', pref === t.value ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line-strong hover:bg-subtle')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Change password">
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" error={errors.currentPassword}>
            <Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" error={errors.newPassword} hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={saving === 'password'} disabled={!pw.current || !pw.next}>
              Change password
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
          {[
            [['Q'], 'Add purchase (also N)'],
            [['V'], 'Create with voice'],
            [['/'], 'Search'],
            [['Ctrl', 'Enter'], 'Save task form'],
            [['Esc'], 'Close panel or dialog'],
          ].map(([keys, label]) => (
            <div key={label as string} className="contents">
              <dt className="flex gap-1">
                {(keys as string[]).map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd className="text-ink-2">{label as string}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionDialog({ section, open, onClose }: { section: Section | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', icon: 'folder' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ name: section?.name ?? '', description: section?.description ?? '', icon: section?.icon ?? 'folder' });
      setError(null);
    }
  }, [open, section]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) return setError('Enter a section name.');
    setBusy(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null, icon: form.icon };
      if (section) await api.patch(`/sections/${section.id}`, body);
      else await api.post('/sections', body);
      qc.invalidateQueries({ queryKey: ['sections'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(section ? 'Section updated' : 'Section created');
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
      title={section ? 'Edit section' : 'New section'}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {section ? 'Save' : 'Create section'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <Field label="Name" required error={error ?? undefined}>
          <Input data-autofocus value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stationery" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SECTION_ICONS).map((key) => (
              <button
                type="button"
                key={key}
                aria-label={key}
                aria-pressed={form.icon === key}
                onClick={() => setForm({ ...form, icon: key })}
                className={cx('flex size-9 items-center justify-center rounded-md border', form.icon === key ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-subtle')}
              >
                <SectionIcon icon={key} />
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

function SectionSettings() {
  const sections = useSections(true);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Section | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sections'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const move = async (index: number, delta: number) => {
    const list = [...(sections.data ?? [])];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    qc.setQueryData(['sections', true], list);
    setBusy(true);
    try {
      await api.post('/sections/reorder', { ids: list.map((s) => s.id) });
    } catch (e) {
      toast.error(errorMessage(e, 'Unable to reorder sections.'));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const toggle = async (s: Section) => {
    try {
      await api.patch(`/sections/${s.id}`, { isActive: !s.isActive });
      toast.success(s.isActive ? `${s.name} disabled` : `${s.name} enabled`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-3">Disabled sections are hidden when creating tasks. Their existing tasks are kept.</p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          New section
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {sections.isPending ? (
          <ListSkeleton rows={5} />
        ) : sections.isError ? (
          <ErrorState message="Unable to load sections." onRetry={() => sections.refetch()} />
        ) : (
          <ul className="divide-y divide-line">
            {sections.data.map((s, i) => (
              <li key={s.id} className={cx('flex items-center gap-3 px-4 py-2.5', !s.isActive && 'bg-canvas')}>
                <div className="flex flex-col">
                  <IconButton label={`Move ${s.name} up`} className="size-5" disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton label={`Move ${s.name} down`} className="size-5" disabled={i === sections.data.length - 1 || busy} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                </div>
                <SectionIcon icon={s.icon} className={cx('size-5', s.isActive ? 'text-ink-2' : 'text-ink-3')} />
                <div className="min-w-0 flex-1">
                  <p className={cx('truncate text-sm font-medium', !s.isActive && 'text-ink-3')}>
                    {s.name}
                    {!s.isActive && <span className="ml-2 rounded bg-muted px-1.5 py-px text-[11px] font-medium text-ink-3">Disabled</span>}
                  </p>
                  {s.description && <p className="truncate text-xs text-ink-3">{s.description}</p>}
                </div>
                <span className="tabular hidden text-xs text-ink-3 sm:inline">{s.pendingCount} pending</span>
                <IconButton
                  label={`Edit ${s.name}`}
                  onClick={() => {
                    setEditing(s);
                    setDialogOpen(true);
                  }}
                >
                  <PencilLine className="size-4" />
                </IconButton>
                <Button size="sm" variant="ghost" onClick={() => toggle(s)}>
                  {s.isActive ? 'Disable' : 'Enable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SectionDialog open={dialogOpen} section={editing} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface UserForm {
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'user';
  password: string;
  isActive: boolean;
  sectionIds: number[];
}

function UserDialog({ user, open, onClose }: { user: UserSummary | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const sections = useSections(true);
  const { user: me } = useAuth();
  const [form, setForm] = useState<UserForm>({ name: '', email: '', phone: '', role: 'user', password: '', isActive: true, sectionIds: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const self = user?.id === me?.id;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'user',
      password: '',
      isActive: user?.isActive ?? true,
      sectionIds: user?.sectionIds ?? [],
    });
  }, [open, user]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Enter a name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email.';
    if (!user && form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (user && form.password && form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      sectionIds: form.sectionIds,
    };
    if (form.password) body.password = form.password;
    if (user && !self) body.isActive = form.isActive;
    try {
      if (user) await api.patch(`/users/${user.id}`, body);
      else await api.post('/users', body);
      qc.invalidateQueries({ queryKey: ['users'] });
      if (self) qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(user ? 'User updated' : 'User added');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleSection = (id: number) =>
    setForm((f) => ({ ...f, sectionIds: f.sectionIds.includes(id) ? f.sectionIds.filter((x) => x !== id) : [...f.sectionIds, id] }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Add user'}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {user ? 'Save' : 'Add user'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <Input data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} inputMode="tel" />
        </Field>
        <Field label="Role" hint={self ? 'You cannot change your own role.' : undefined}>
          <Select value={form.role} disabled={self} onChange={(e) => setForm({ ...form, role: e.target.value as UserForm['role'] })}>
            <option value="user">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label={user ? 'Reset password' : 'Password'} required={!user} error={errors.password} hint={user ? 'Leave blank to keep the current password.' : 'At least 8 characters'} className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1 text-[13px] font-medium text-ink-2">Section access</p>
          <p className="mb-2 text-xs text-ink-3">Members see all tasks in these sections, plus tasks they created or are assigned. Admins see everything.</p>
          <div className="flex flex-wrap gap-1.5">
            {sections.data?.map((s) => {
              const on = form.sectionIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={on}
                  onClick={() => toggleSection(s.id)}
                  className={cx('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]', on ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line-strong text-ink-2 hover:bg-subtle')}
                >
                  <SectionIcon icon={s.icon} className="size-3.5" />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
        {user && !self && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-[var(--accent)]" />
            Active — inactive users cannot sign in or be assigned tasks
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

function UserSettings() {
  const users = useUsers(true);
  const sections = useSections(true);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [open, setOpen] = useState(false);
  const sectionName = (id: number) => sections.data?.find((s) => s.id === id)?.name;

  return (
    <div className="pb-8">
      <div className="mb-3 flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add user
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {users.isPending ? (
          <ListSkeleton rows={4} />
        ) : users.isError ? (
          <ErrorState message="Unable to load users." onRetry={() => users.refetch()} />
        ) : (
          <ul className="divide-y divide-line">
            {users.data.map((u) => (
              <li key={u.id} className={cx('flex items-center gap-3 px-4 py-3', !u.isActive && 'bg-canvas')}>
                <Avatar name={u.name} size={32} className={cx(!u.isActive && 'opacity-50')} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {u.name}
                    {u.role === 'admin' && <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Admin</span>}
                    {!u.isActive && <span className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-ink-3">Inactive</span>}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </p>
                  {u.role !== 'admin' && (
                    <p className="mt-0.5 truncate text-xs text-ink-2">{u.sectionIds.length ? u.sectionIds.map(sectionName).filter(Boolean).join(', ') : 'No section access'}</p>
                  )}
                </div>
                <IconButton
                  label={`Edit ${u.name}`}
                  onClick={() => {
                    setEditing(u);
                    setOpen(true);
                  }}
                >
                  <PencilLine className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      <UserDialog open={open} user={editing} onClose={() => setOpen(false)} />
    </div>
  );
}
