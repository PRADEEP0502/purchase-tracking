import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../lib/api';

/**
 * Admin-only warning when the deployment stores data temporarily (no database connected),
 * so tasks are not silently lost when the hosting server restarts.
 */
export function SystemWarning() {
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  const system = useQuery({
    queryKey: ['system'],
    queryFn: () => api.get<{ database: string; temporaryData: boolean; push: boolean }>('/system').then((r) => r.data),
    enabled: admin,
    staleTime: 10 * 60_000,
  });
  if (!admin || !system.data?.temporaryData) return null;
  return (
    <div className="flex items-start gap-2 border-b border-urgent/30 bg-urgent-soft px-4 py-2 text-[13px] text-ink sm:px-5">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" />
      <span>
        <strong className="font-semibold">Data is temporary.</strong> No database is connected, so tasks and users are lost when the server restarts. Connect a
        PostgreSQL database by setting <code className="rounded bg-surface px-1">DATABASE_URL</code> on your hosting service.
      </span>
    </div>
  );
}
