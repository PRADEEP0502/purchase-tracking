import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-wide">JPM PURCHASE</p>
            <p className="text-xs text-ink-3">Purchase task manager</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-3">Use your JPM account to continue.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="name@company.com" invalid={!!error} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} />
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-urgent-soft px-3 py-2 text-sm text-urgent">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-8 rounded-lg border border-dashed border-line-strong p-3 text-xs text-ink-3">
            <p className="font-medium text-ink-2">Demo accounts (development only)</p>
            <p className="mt-1">pradeep@jpm.local (admin) · ashok@jpm.local · kumar@jpm.local · ravi@jpm.local</p>
            <p>Password: Jpm@12345</p>
          </div>
        )}
      </div>
    </div>
  );
}
