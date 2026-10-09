import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { useInstall } from '../lib/pwa';
import { Button, IconButton } from './ui';

const DISMISS_KEY = 'jpm-install-dismissed';
export const installDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

function IosSteps() {
  return (
    <ol className="mt-1.5 space-y-1 text-[13px] text-ink-2">
      <li className="flex items-center gap-1.5">
        1. Tap <Share className="size-4 text-accent" /> <strong className="text-ink">Share</strong> in Safari
      </li>
      <li className="flex items-center gap-1.5">
        2. Choose <SquarePlus className="size-4 text-accent" /> <strong className="text-ink">Add to Home Screen</strong>
      </li>
    </ol>
  );
}

/** Inline banner on phones, shown until the app is installed or the user says not now. */
export function InstallBanner() {
  const { canPrompt, iosManual, install } = useInstall();
  const [hidden, setHidden] = useState(installDismissed);
  if (hidden || (!canPrompt && !iosManual)) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
    window.dispatchEvent(new Event('jpm:install-dismissed'));
  };

  return (
    <div className="mx-4 mt-4 flex gap-3 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3 md:hidden">
      <Smartphone className="mt-0.5 size-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Install the JPM Tasks app</p>
        <p className="text-[13px] text-ink-2">Opens full screen from your home screen, with task alerts in the notification bar.</p>
        {iosManual ? (
          <IosSteps />
        ) : (
          <Button
            size="sm"
            variant="primary"
            className="mt-2"
            icon={<Download className="size-3.5" />}
            onClick={async () => {
              if (await install()) toast.success('App installed');
            }}
          >
            Install app
          </Button>
        )}
      </div>
      <IconButton label="Not now" onClick={close} className="-mt-1 -mr-2 size-7">
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

/** Settings card: install status and action. */
export function InstallCard() {
  const { installed, canPrompt, iosManual, install } = useInstall();
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">App</h2>
        <p className="mt-0.5 text-xs text-ink-3">Install JPM Tasks on your phone or computer like a regular app.</p>
      </div>
      <div className="p-5 text-sm">
        {installed ? (
          <p className="text-ink-2">You are using the installed app.</p>
        ) : canPrompt ? (
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="size-3.5" />}
            onClick={async () => {
              if (await install()) toast.success('App installed');
            }}
          >
            Install app
          </Button>
        ) : iosManual ? (
          <IosSteps />
        ) : (
          <p className="text-ink-2">
            Open this site in Chrome (Android) or Safari (iPhone), then use <strong className="text-ink">Install app</strong> /{' '}
            <strong className="text-ink">Add to Home Screen</strong> from the browser menu.
          </p>
        )}
      </div>
    </section>
  );
}
