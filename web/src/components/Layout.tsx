import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  Inbox,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Shapes,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../auth';
import { cx } from '../lib/format';
import { useDashboard, useSections } from '../lib/queries';
import { useLiveUpdates } from '../lib/live';
import { useAppState } from './app-state';
import { NotificationsButton } from './Notifications';
import { SectionIcon } from './task-bits';
import { TaskFormDialog } from './TaskForm';
import { TaskPanel } from './TaskPanel';
import { VoiceTaskDialog } from './VoiceTaskDialog';
import { Avatar, IconButton, Kbd } from './ui';

const SIDEBAR_KEY = 'jpm-sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function NavItem({ to, icon, label, count, collapsed, end, onNavigate, tone }: { to: string; icon: ReactNode; label: string; count?: number; collapsed?: boolean; end?: boolean; onNavigate?: () => void; tone?: 'urgent' }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors',
          isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-subtle hover:text-ink',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && !!count && <span className={cx('tabular text-xs', tone === 'urgent' ? 'font-semibold text-urgent' : 'text-ink-3')}>{count}</span>}
    </NavLink>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const dash = useDashboard();
  const sections = useSections();
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const counts = dash.data?.counts;
  const priorityCount = dash.data ? dash.data.counts.urgent : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-14 shrink-0 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[13px] font-bold tracking-wide text-ink">JPM PURCHASE</p>
            <p className="text-[11px] text-ink-3">Task Manager</p>
          </div>
        )}
        {onToggle && !collapsed && (
          <IconButton label="Collapse sidebar" onClick={onToggle} className="-mr-2">
            <PanelLeftClose className="size-4" />
          </IconButton>
        )}
      </div>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
        <NavItem to="/" end icon={<LayoutDashboard className="size-4" />} label="Overview" collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/inbox" icon={<Inbox className="size-4" />} label="Inbox" count={counts?.inbox} collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/my" icon={<UserRoundCheck className="size-4" />} label="My Tasks" count={counts?.mine} collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/all" icon={<LayoutList className="size-4" />} label="All Tasks" count={counts?.pending} collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/priority" icon={<Flag className="size-4" />} label="Priority" count={priorityCount} tone="urgent" collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/completed" icon={<CheckCircle2 className="size-4" />} label="Completed" collapsed={collapsed} onNavigate={onNavigate} />

        <div className="pt-4">
          {collapsed ? (
            <NavItem to="/sections" end icon={<Shapes className="size-4" />} label="Sections" collapsed onNavigate={onNavigate} />
          ) : (
            <>
              <div className="flex items-center pr-1">
                <NavLink to="/sections" end onClick={onNavigate} className="flex-1 px-2.5 py-1 text-xs font-semibold tracking-wide text-ink-3 uppercase hover:text-ink">
                  Sections
                </NavLink>
                <IconButton label={sectionsOpen ? 'Hide sections' : 'Show sections'} onClick={() => setSectionsOpen((o) => !o)} className="size-6">
                  <ChevronDown className={cx('size-3.5 transition-transform', !sectionsOpen && '-rotate-90')} />
                </IconButton>
              </div>
              {sectionsOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {sections.data?.map((s) => (
                    <NavItem key={s.id} to={`/sections/${s.id}`} icon={<SectionIcon icon={s.icon} />} label={s.name} count={s.pendingCount} onNavigate={onNavigate} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-line px-2.5 py-2.5">
        <NavItem to="/settings" icon={<Settings className="size-4" />} label="Settings" collapsed={collapsed} onNavigate={onNavigate} />
        <div className={cx('flex items-center gap-2.5 rounded-md px-2.5 py-1.5', collapsed && 'flex-col px-0')}>
          <Avatar name={user?.name} size={24} />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium">{user?.name}</p>
              <p className="text-[11px] text-ink-3 capitalize">{user?.role === 'admin' ? 'Admin' : 'Member'}</p>
            </div>
          )}
          <IconButton label="Sign out" onClick={logout} className="size-7">
            <LogOut className="size-3.5" />
          </IconButton>
        </div>
        {collapsed && onToggle && (
          <IconButton label="Expand sidebar" onClick={onToggle} className="mx-auto flex">
            <PanelLeftOpen className="size-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function SearchBox({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === '/search';
  const [value, setValue] = useState(onSearchPage ? (params.get('q') ?? '') : '');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!onSearchPage) setValue('');
  }, [onSearchPage]);

  const go = (q: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`, { replace: onSearchPage });
      else if (onSearchPage) navigate('/all', { replace: true });
    }, 250);
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          go(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue('');
            go('');
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search tasks, people, sections, messages…"
        aria-label="Search"
        className="h-9 w-full rounded-md border border-transparent bg-subtle pr-10 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/15 focus:outline-none"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 sm:block">
        <Kbd>/</Kbd>
      </span>
    </div>
  );
}

export function Layout() {
  const { openCreate, openVoice, createOpen, voiceOpen, taskId } = useAppState();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  useLiveUpdates(true);

  useEffect(() => setDrawer(false), [location.pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  // Keyboard shortcuts: Q / N = add purchase, V = voice, / = search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (createOpen || voiceOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'q' || k === 'n') {
        e.preventDefault();
        openCreate();
      } else if (k === 'v') {
        e.preventDefault();
        openVoice();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openCreate, openVoice, createOpen, voiceOpen]);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className={cx('hidden shrink-0 border-r border-line bg-canvas transition-[width] duration-150 md:block', collapsed ? 'w-[60px]' : 'w-[248px]')}>
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30 animate-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-canvas pt-[env(safe-area-inset-top)] shadow-2xl animate-panel">
            <IconButton label="Close menu" onClick={() => setDrawer(false)} className="absolute top-3 right-2">
              <X className="size-4" />
            </IconButton>
            <Sidebar collapsed={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cx('flex min-w-0 flex-1 flex-col transition-[padding] duration-150', !!taskId && 'lg:pr-[480px]')}>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-5">
          <IconButton label="Open menu" onClick={() => setDrawer(true)} className="md:hidden">
            <Menu className="size-5" />
          </IconButton>
          <SearchBox inputRef={searchRef} />
          <span className="flex-1" />
          <NotificationsButton />
          <button
            onClick={openVoice}
            title="Create with voice (V)"
            className="hidden h-9 shrink-0 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium whitespace-nowrap text-ink hover:bg-subtle sm:inline-flex"
          >
            <Mic className="size-4 text-accent" />
            <span className={cx('hidden', taskId ? '2xl:inline' : 'lg:inline')}>Create with Voice</span>
          </button>
          <button
            onClick={() => openCreate()}
            title="Add purchase (Q)"
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium whitespace-nowrap text-accent-ink shadow-sm hover:brightness-110 sm:inline-flex"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Add Purchase
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      <MobileNav onMenu={() => setDrawer(true)} />
      <TaskPanel />
      <TaskFormDialog />
      <VoiceTaskDialog />
    </div>
  );
}

/** Bottom navigation on phones. The voice button sits in the thumb zone. */
function MobileNav({ onMenu }: { onMenu: () => void }) {
  const { openVoice, openCreate } = useAppState();
  const item = (to: string, icon: ReactNode, label: string, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10.5px] font-medium', isActive ? 'text-accent' : 'text-ink-3')}>
      {icon}
      {label}
    </NavLink>
  );
  return (
    <>
      <button
        onClick={() => openCreate()}
        aria-label="Add purchase"
        className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex size-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-lg md:hidden"
      >
        <Plus className="size-5" strokeWidth={2.5} />
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-end border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {item('/', <LayoutDashboard className="size-5" />, 'Home', true)}
        {item('/my', <UserRoundCheck className="size-5" />, 'My Tasks')}
        <div className="flex flex-1 justify-center">
          <button onClick={openVoice} aria-label="Create with voice" className="-mt-5 mb-1 flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg ring-4 ring-canvas active:scale-95">
            <Mic className="size-6" />
          </button>
        </div>
        {item('/sections', <Shapes className="size-5" />, 'Sections')}
        <button onClick={onMenu} className="flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10.5px] font-medium text-ink-3">
          <Menu className="size-5" />
          More
        </button>
      </nav>
    </>
  );
}
