import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './auth';
import { AppStateProvider } from './components/app-state';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useTheme } from './lib/theme';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { AllTasksPage, CompletedPage, InboxPage, MyTasksPage, PriorityPage, SearchPage, SectionPage } from './pages/TaskPages';
import { SectionsPage } from './pages/Sections';
import { SettingsPage } from './pages/Settings';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <AppStateProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="my" element={<MyTasksPage />} />
          <Route path="all" element={<AllTasksPage />} />
          <Route path="priority" element={<PriorityPage />} />
          <Route path="completed" element={<CompletedPage />} />
          <Route path="sections" element={<SectionsPage />} />
          <Route path="sections/:id" element={<SectionPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppStateProvider>
  );
}

export function App() {
  const { resolved } = useTheme();
  return (
    <AuthProvider>
      <Gate />
      <Toaster position="bottom-center" theme={resolved} richColors={false} closeButton toastOptions={{ className: 'font-sans' }} offset={{ bottom: 88 }} mobileOffset={{ bottom: 88 }} />
    </AuthProvider>
  );
}
