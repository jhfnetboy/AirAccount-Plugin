import '@src/Options.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage, forestSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';

const Options = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const forestSettings = useStorage(forestSettingsStorage);
  const logo = isLight ? 'options/logo_horizontal.svg' : 'options/logo_horizontal_dark.svg';

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  return (
    <div className={cn('App', isLight ? 'bg-slate-50 text-gray-900' : 'bg-gray-800 text-gray-100', 'p-6')}>
      <button onClick={goGithubSite}>
        <img src={chrome.runtime.getURL(logo)} className="App-logo" alt="logo" />
      </button>
      <div className={cn('mt-6 grid w-full max-w-xl gap-4')}>
        <div className={cn('text-lg font-semibold')}>Forest Settings</div>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>RPC URL</div>
          <input
            className={cn(
              'w-full rounded border px-3 py-2',
              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-gray-100',
            )}
            value={forestSettings.rpcUrl}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, rpcUrl: e.target.value }))}
            placeholder="https://mainnet.optimism.io"
          />
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>Resolver Address</div>
          <input
            className={cn(
              'w-full rounded border px-3 py-2 font-mono text-sm',
              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-gray-100',
            )}
            value={forestSettings.resolverAddress}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, resolverAddress: e.target.value.trim() }))}
            placeholder="0x..."
          />
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>IPFS Gateway Base URL</div>
          <input
            className={cn(
              'w-full rounded border px-3 py-2',
              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-gray-100',
            )}
            value={forestSettings.ipfsGatewayUrl}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, ipfsGatewayUrl: e.target.value }))}
            placeholder="https://cloudflare-ipfs.com/ipfs/"
          />
        </label>

        <label className={cn('flex items-center gap-2')}>
          <input
            type="checkbox"
            checked={forestSettings.cacheEnabled}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, cacheEnabled: e.target.checked }))}
          />
          <div className={cn('text-sm')}>Enable cache</div>
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>Cache TTL (seconds)</div>
          <input
            type="number"
            min={0}
            className={cn(
              'w-full rounded border px-3 py-2',
              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-gray-100',
            )}
            value={forestSettings.cacheTtlSeconds}
            onChange={e =>
              forestSettingsStorage.set(prev => ({
                ...prev,
                cacheTtlSeconds: Number.isFinite(e.target.valueAsNumber)
                  ? e.target.valueAsNumber
                  : prev.cacheTtlSeconds,
              }))
            }
          />
        </label>

        <div className={cn('flex gap-2')}>
          <ToggleButton onClick={exampleThemeStorage.toggle}>{t('toggleTheme')}</ToggleButton>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
