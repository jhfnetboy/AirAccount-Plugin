import '@src/Renderer.css';
import { cacheGet, cacheSet } from './cache';
import {
  decodeAbiBytes,
  decodeAbiString,
  encodeContenthashCall,
  encodeTextCall,
  formatHexBytes,
  namehash,
} from './ens';
import { ethCall } from './eth-rpc';
import { fetchIpfsBundle, parseIpfsPointer } from './ipfs';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage, forestSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useEffect, useMemo, useState } from 'react';

type OriginalUrlResponse = { ok: true; url: string } | { ok: false; error: string };

type ResolvedState = {
  node: string;
  contenthash: string | null;
  texts: Record<string, string | null>;
};

type BundleState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; error: string }
  | {
      kind: 'ready';
      bundle:
        | { kind: 'json'; cid: string; preview: string }
        | { kind: 'markdown'; cid: string; preview: string }
        | { kind: 'image'; cid: string; url: string }
        | { kind: 'unknown'; cid: string; url: string; contentType: string | null };
    };

const Renderer = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const forestSettings = useStorage(forestSettingsStorage);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedState | null>(null);
  const [bundle, setBundle] = useState<BundleState>({ kind: 'none' });

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
      setBundle({ kind: 'none' });

      const rpcUrl = forestSettings.rpcUrl.trim();
      const resolverAddress = forestSettings.resolverAddress.trim();
      const cacheEnabled = forestSettings.cacheEnabled;
      const cacheTtlSeconds = forestSettings.cacheTtlSeconds;

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

        if (cacheEnabled) {
          const cachedResolved = await cacheGet<ResolvedState>(
            ['resolver', rpcUrl, resolverAddress, node],
            cacheTtlSeconds,
          );
          if (cachedResolved) {
            setResolved(cachedResolved);
          }
        }

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

        const nextResolved: ResolvedState = { node, contenthash, texts };
        setResolved(nextResolved);

        if (cacheEnabled) {
          await cacheSet(['resolver', rpcUrl, resolverAddress, node], nextResolved);
        }
      } catch (e) {
        setResolveError(e instanceof Error ? e.message : 'resolve_failed');
      }
    };

    void run();
  }, [
    forestSettings.cacheEnabled,
    forestSettings.cacheTtlSeconds,
    forestSettings.resolverAddress,
    forestSettings.rpcUrl,
    parsed?.hostname,
  ]);

  useEffect(() => {
    const run = async () => {
      if (!parsed?.hostname) return;
      if (!resolved) return;

      const cacheEnabled = forestSettings.cacheEnabled;
      const cacheTtlSeconds = forestSettings.cacheTtlSeconds;
      const gatewayBase = forestSettings.ipfsGatewayUrl;

      const content = resolved.texts.content;
      const pointer = content ? parseIpfsPointer(content) : null;
      if (!pointer) {
        setBundle({ kind: 'none' });
        return;
      }

      if (cacheEnabled) {
        const cached = await cacheGet<BundleState>(['ipfs', gatewayBase, pointer.cid, pointer.path], cacheTtlSeconds);
        if (cached && cached.kind === 'ready') {
          setBundle(cached);
        }
      }

      try {
        setBundle({ kind: 'loading' });
        const fetched = await fetchIpfsBundle(gatewayBase, pointer);

        const next: BundleState =
          fetched.kind === 'json'
            ? {
                kind: 'ready',
                bundle: {
                  kind: 'json',
                  cid: fetched.cid,
                  preview: JSON.stringify(fetched.json, null, 2).slice(0, 50_000),
                },
              }
            : fetched.kind === 'markdown'
              ? {
                  kind: 'ready',
                  bundle: { kind: 'markdown', cid: fetched.cid, preview: fetched.text.slice(0, 50_000) },
                }
              : fetched.kind === 'image'
                ? { kind: 'ready', bundle: { kind: 'image', cid: fetched.cid, url: fetched.url } }
                : { kind: 'ready', bundle: fetched };

        setBundle(next);

        if (cacheEnabled) {
          await cacheSet(['ipfs', gatewayBase, pointer.cid, pointer.path], next);
        }
      } catch (e) {
        setBundle({ kind: 'error', error: e instanceof Error ? e.message : 'ipfs_failed' });
      }
    };

    void run();
  }, [
    forestSettings.cacheEnabled,
    forestSettings.cacheTtlSeconds,
    forestSettings.ipfsGatewayUrl,
    parsed?.hostname,
    resolved,
  ]);

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
                <div className={cn('mt-4 space-y-2')}>
                  <div className={cn('text-lg font-semibold')}>Template</div>
                  {bundle.kind === 'none' ? (
                    <div className={cn('text-sm opacity-70')}>No content pointer set (text record: content)</div>
                  ) : bundle.kind === 'loading' ? (
                    <div className={cn('text-sm opacity-70')}>Fetching IPFS…</div>
                  ) : bundle.kind === 'error' ? (
                    <div>
                      Error: <code>{bundle.error}</code>
                    </div>
                  ) : bundle.bundle.kind === 'image' ? (
                    <img src={bundle.bundle.url} className={cn('max-w-full rounded border')} alt="ipfs" />
                  ) : bundle.bundle.kind === 'json' ? (
                    <pre className={cn('whitespace-pre-wrap rounded border p-3 text-xs')}>{bundle.bundle.preview}</pre>
                  ) : bundle.bundle.kind === 'markdown' ? (
                    <pre className={cn('whitespace-pre-wrap rounded border p-3 text-xs')}>{bundle.bundle.preview}</pre>
                  ) : (
                    <div>
                      Unsupported: <code>{bundle.bundle.contentType ?? 'unknown'}</code>
                    </div>
                  )}
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
