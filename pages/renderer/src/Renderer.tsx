import '@src/Renderer.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useEffect, useMemo, useState } from 'react';

type OriginalUrlResponse = { ok: true; url: string } | { ok: false; error: string };

const Renderer = () => {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!originalUrl) return null;
    try {
      const url = new URL(originalUrl);
      return {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}${url.hash}`,
      };
    } catch {
      return null;
    }
  }, [originalUrl]);

  useEffect(() => {
    const run = async () => {
      const tab = await chrome.tabs.getCurrent();
      const response = (await chrome.runtime.sendMessage({
        type: 'forest:getOriginalUrl',
        tabId: tab?.id,
      })) as OriginalUrlResponse;

      if (response.ok) {
        setOriginalUrl(response.url);
        return;
      }

      setError('error' in response ? response.error : 'unknown_error');
    };

    void run();
  }, []);

  const openOptions = () => chrome.runtime.openOptionsPage();

  return (
    <div className={cn('Renderer', 'bg-slate-50 text-gray-900')}>
      <div className={cn('text-2xl font-semibold')}>Mushroom Forest Renderer</div>
      {originalUrl ? (
        <>
          <div>
            Host: <code>{parsed?.hostname ?? '(parse failed)'}</code>
          </div>
          <div>
            Path: <code>{parsed?.path ?? '(parse failed)'}</code>
          </div>
        </>
      ) : error ? (
        <div>
          Error: <code>{error}</code>
        </div>
      ) : (
        <div className={cn('text-sm opacity-70')}>Loading…</div>
      )}
      <div className={cn('flex gap-2')}>
        <ToggleButton onClick={openOptions}>Open settings</ToggleButton>
        <ToggleButton onClick={exampleThemeStorage.toggle}>Toggle theme</ToggleButton>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Renderer, <LoadingSpinner />), ErrorDisplay);
