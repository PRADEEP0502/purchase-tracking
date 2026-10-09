import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { api, ApiError, errorMessage } from '../lib/api';
import { Button, Field, Input, Spinner } from '../components/ui';

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
        <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </div>
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-wide">JPM PURCHASE</p>
        <p className="text-xs text-ink-3">Purchase task manager</p>
      </div>
    </div>
  );
}

/** Shown once, on a brand-new installation: create the first admin account. */
function SetupForm({ onDone }: { onDone: () => void }) {
  const { setup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email.';
    if (form.password.length < 8) errs.password = 'At least 8 characters.';
    else if (form.password !== form.confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await setup(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'setup_done') return onDone();
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Set up JPM Purchase</h1>
      <p className="mt-1 text-sm text-ink-3">Welcome! Create the admin account. You can add sections and your team after signing in.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Your name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus autoComplete="name" invalid={!!errors.name} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} invalid={!!errors.confirm} />
        </Field>
        {errors._ && (
          <p role="alert" className="rounded-md bg-urgent-soft px-3 py-2 text-sm text-urgent">
            {errors._}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          Create admin account
        </Button>
      </form>
    </>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<{ needsSetup: boolean }>('/auth/setup')
      .then((r) => setNeedsSetup(r.data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

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
        <Brand />
        {needsSetup === null ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : needsSetup ? (
          <SetupForm onDone={() => setNeedsSetup(false)} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
