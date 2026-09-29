import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppState } from './app-state';

export function PageHeader({ title, icon, subtitle, actions, children }: { title: ReactNode; icon?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-3 sm:px-5 sm:pt-7">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[22px] leading-tight font-semibold tracking-tight">
            {icon && <span className="text-ink-3">{icon}</span>}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Content card that holds a list — keeps pages aligned at a comfortable reading width. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[920px]">{children}</div>;
}

export function ListCard({ children }: { children: ReactNode }) {
  return <div className="mx-4 overflow-hidden rounded-lg border border-line bg-surface sm:mx-5">{children}</div>;
}

export function AddRow({ sectionId }: { sectionId?: number }) {
  const { openCreate } = useAppState();
  return (
    <button
      onClick={() => openCreate(sectionId ? { sectionId } : undefined)}
      className="group flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-ink-3 hover:text-accent sm:px-5"
    >
      <span className="flex size-[18px] items-center justify-center rounded-full text-accent group-hover:bg-accent group-hover:text-accent-ink">
        <Plus className="size-4" />
      </span>
      Add Purchase
    </button>
  );
}
