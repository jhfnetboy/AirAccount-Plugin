import '@src/Renderer.css';
import {
  decodeAbiBytes,
  decodeAbiString,
  encodeContenthashCall,
  encodeTextCall,
  formatHexBytes,
  namehash,
} from './ens';
import { ethCall } from './eth-rpc';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage, forestSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useEffect, useMemo, useState } from 'react';

type OriginalUrlResponse = { ok: true; url: string } | { ok: false; error: string };

const Renderer = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const forestSettings = useStorage(forestSettingsStorage);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    node: string;
    contenthash: string | null;
    texts: Record<string, string | null>;
  } | null>(null);

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

  useEffect(() => {
    const run = async () => {
      if (!parsed?.hostname) return;

      setResolveError(null);
      setResolved(null);

      const rpcUrl = forestSettings.rpcUrl.trim();
      const resolverAddress = forestSettings.resolverAddress.trim();

      if (!rpcUrl) {
        setResolveError('missing_rpc_url');
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(resolverAddress)) {
        setResolveError('invalid_resolver_address');
        return;
      }

      try {
        const node = namehash(parsed.hostname);
        const contenthashResult = await ethCall(rpcUrl, {
          to: resolverAddress,
          data: encodeContenthashCall(node),
        });
        const contenthashBytes = decodeAbiBytes(contenthashResult);
        const contenthash = contenthashBytes ? formatHexBytes(contenthashBytes) : null;

        const keys = ['title', 'description', 'avatar', 'content'] as const;
        const texts: Record<string, string | null> = {};
        for (const key of keys) {
          const r = await ethCall(rpcUrl, {
            to: resolverAddress,
            data: encodeTextCall(node, key),
          });
          texts[key] = decodeAbiString(r);
        }

        setResolved({ node, contenthash, texts });
      } catch (e) {
        setResolveError(e instanceof Error ? e.message : 'resolve_failed');
      }
    };

    void run();
  }, [forestSettings.resolverAddress, forestSettings.rpcUrl, parsed?.hostname]);

  const openOptions = () => chrome.runtime.openOptionsPage();

  return (
    <div className={cn('Renderer', isLight ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100')}>
      <div className={cn('text-2xl font-semibold')}>Mushroom Forest Renderer</div>
      {originalUrl ? (
        <>
          <div>
            Host: <code>{parsed?.hostname ?? '(parse failed)'}</code>
          </div>
          <div>
            Path: <code>{parsed?.path ?? '(parse failed)'}</code>
          </div>
          <div className={cn('mt-4 space-y-2')}>
            <div className={cn('text-lg font-semibold')}>Resolved</div>
            {resolveError ? (
              <div>
                Error: <code>{resolveError}</code>
              </div>
            ) : resolved ? (
              <>
                <div>
                  Node: <code className={cn('break-all')}>{resolved.node}</code>
                </div>
                <div>
                  Contenthash: <code className={cn('break-all')}>{resolved.contenthash ?? '(missing)'}</code>
                </div>
                <div className={cn('space-y-1')}>
                  <div>Texts:</div>
                  {Object.entries(resolved.texts).map(([k, v]) => (
                    <div key={k}>
                      <code>{k}</code>: <code className={cn('break-all')}>{v ?? '(missing)'}</code>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={cn('text-sm opacity-70')}>Resolving…</div>
            )}
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
