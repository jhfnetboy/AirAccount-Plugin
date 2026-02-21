import '@src/Options.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage, forestDashboardStorage, forestSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useMemo, useState } from 'react';

const ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
] as const;

const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
] as const;

const MASK_64 = (1n << 64n) - 1n;

const rotl64 = (x: bigint, shift: number) => {
  const s = BigInt(shift);
  return ((x << s) | (x >> (64n - s))) & MASK_64;
};

const keccakF1600 = (state: bigint[]) => {
  const b = new Array<bigint>(25).fill(0n);
  const c = new Array<bigint>(5).fill(0n);
  const d = new Array<bigint>(5).fill(0n);

  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;
      }
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const lane = state[x + 5 * y];
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        b[newX + 5 * newY] = rotl64(lane, ROTATION_OFFSETS[x][y]);
      }
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & b[((x + 2) % 5) + 5 * y]);
        state[x + 5 * y] &= MASK_64;
      }
    }

    state[0] ^= ROUND_CONSTANTS[round];
  }
};

const bytesToHex = (bytes: Uint8Array) => {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex;
};

const hexToBytes = (hex: string) => {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) throw new Error('invalid_hex');
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const concatBytes = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const keccak256 = (data: Uint8Array) => {
  const rateBytes = 136;
  const state = new Array<bigint>(25).fill(0n);

  let offset = 0;
  while (offset + rateBytes <= data.length) {
    for (let i = 0; i < rateBytes / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) {
        lane |= BigInt(data[offset + i * 8 + j]!) << (8n * BigInt(j));
      }
      state[i] ^= lane;
    }
    keccakF1600(state);
    offset += rateBytes;
  }

  const block = new Uint8Array(rateBytes).fill(0);
  block.set(data.subarray(offset));
  block[data.length - offset] = 0x01;
  block[rateBytes - 1] |= 0x80;

  for (let i = 0; i < rateBytes / 8; i++) {
    let lane = 0n;
    for (let j = 0; j < 8; j++) lane |= BigInt(block[i * 8 + j]!) << (8n * BigInt(j));
    state[i] ^= lane;
  }
  keccakF1600(state);

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const lane = state[i];
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((lane >> (8n * BigInt(j))) & 0xffn);
  }
  return out;
};

const functionSelector = (signature: string) => keccak256(new TextEncoder().encode(signature)).subarray(0, 4);

const uint256ToBytes32 = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_uint');
  const out = new Uint8Array(32);
  let v = BigInt(value);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

const encodeSetTextCall = (node: string, key: string, value: string) => {
  const selector = functionSelector('setText(bytes32,string,string)');
  const nodeBytes = hexToBytes(node);
  if (nodeBytes.length !== 32) throw new Error('invalid_node');

  const keyBytes = new TextEncoder().encode(key);
  const valueBytes = new TextEncoder().encode(value);

  const keyLen = uint256ToBytes32(keyBytes.length);
  const valueLen = uint256ToBytes32(valueBytes.length);

  const paddedKey = new Uint8Array(Math.ceil(keyBytes.length / 32) * 32).fill(0);
  paddedKey.set(keyBytes, 0);

  const paddedValue = new Uint8Array(Math.ceil(valueBytes.length / 32) * 32).fill(0);
  paddedValue.set(valueBytes, 0);

  const keySection = concatBytes(keyLen, paddedKey);
  const valueSection = concatBytes(valueLen, paddedValue);

  const keyOffset = 96;
  const valueOffset = keyOffset + keySection.length;

  const head = concatBytes(concatBytes(nodeBytes, uint256ToBytes32(keyOffset)), uint256ToBytes32(valueOffset));
  const data = concatBytes(concatBytes(head, keySection), valueSection);

  return `0x${bytesToHex(concatBytes(selector, data))}`;
};

const namehash = (name: string) => {
  let node = new Uint8Array(32).fill(0);
  const normalized = name.trim().toLowerCase();
  if (!normalized) return `0x${bytesToHex(node)}`;
  const labels = normalized.split('.').filter(Boolean);
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(new TextEncoder().encode(labels[i]!));
    node = keccak256(concatBytes(node, labelHash));
  }
  return `0x${bytesToHex(node)}`;
};

const Options = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const forestSettings = useStorage(forestSettingsStorage);
  const forestDashboard = useStorage(forestDashboardStorage);
  const logo = isLight ? 'options/logo_horizontal.svg' : 'options/logo_horizontal_dark.svg';
  const [nameDraftInput, setNameDraftInput] = useState('');
  const [ipfsStatus, setIpfsStatus] = useState<{ kind: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({
    kind: 'idle',
  });
  const [txStatus, setTxStatus] = useState<{ kind: 'idle' | 'success' | 'error'; message?: string }>({ kind: 'idle' });

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const inputClassName = useMemo(
    () =>
      cn(
        'w-full rounded border px-3 py-2',
        isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-gray-100',
      ),
    [isLight],
  );

  const connectWallet = async () => {
    setTxStatus({ kind: 'idle' });
    const eth = (window as unknown as { ethereum?: { request?: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!eth?.request) {
      setTxStatus({ kind: 'error', message: 'no_wallet_provider' });
      return;
    }

    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as unknown;
    const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '';
    if (!address) {
      setTxStatus({ kind: 'error', message: 'no_account' });
      return;
    }

    await forestDashboardStorage.set(prev => ({ ...prev, selectedAddress: address }));
    setTxStatus({ kind: 'success', message: address });
  };

  const addName = async () => {
    const name = nameDraftInput.trim();
    if (!name) return;
    await forestDashboardStorage.set(prev => ({
      ...prev,
      names: prev.names.includes(name) ? prev.names : prev.names.concat(name),
      draft: { ...prev.draft, name },
    }));
    setNameDraftInput('');
  };

  const uploadToIpfs = async () => {
    setIpfsStatus({ kind: 'loading' });
    try {
      const apiBase = forestSettings.ipfsApiUrl.trim().replace(/\/$/, '');
      if (!apiBase) {
        setIpfsStatus({ kind: 'error', message: 'missing_ipfs_api_url' });
        return;
      }

      const payload = {
        title: forestDashboard.draft.title.trim(),
        description: forestDashboard.draft.description.trim(),
        avatar: forestDashboard.draft.avatar.trim(),
      };

      const body = JSON.stringify(payload, null, 2);
      const file = new Blob([body], { type: 'application/json' });
      const form = new FormData();
      form.append('file', file, 'profile.json');

      const response = await fetch(`${apiBase}/api/v0/add?pin=true&cid-version=1`, { method: 'POST', body: form });
      const text = await response.text();

      if (!response.ok) {
        setIpfsStatus({ kind: 'error', message: `ipfs_http_${response.status}` });
        return;
      }

      const lastLine = text.trim().split('\n').at(-1);
      const parsed = lastLine ? (JSON.parse(lastLine) as { Hash?: string }) : null;
      const cid = parsed?.Hash?.trim() ?? '';
      if (!cid) {
        setIpfsStatus({ kind: 'error', message: 'ipfs_bad_response' });
        return;
      }

      await forestDashboardStorage.set(prev => ({
        ...prev,
        draft: { ...prev.draft, contentPointer: `ipfs://${cid}`, lastPublishedCid: cid },
      }));
      setIpfsStatus({ kind: 'success', message: cid });
    } catch (e) {
      setIpfsStatus({ kind: 'error', message: e instanceof Error ? e.message : 'ipfs_failed' });
    }
  };

  const sendSetContentTx = async () => {
    setTxStatus({ kind: 'idle' });
    const eth = (window as unknown as { ethereum?: { request?: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!eth?.request) {
      setTxStatus({ kind: 'error', message: 'no_wallet_provider' });
      return;
    }

    const resolverAddress = forestSettings.resolverAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(resolverAddress)) {
      setTxStatus({ kind: 'error', message: 'invalid_resolver_address' });
      return;
    }

    const name = forestDashboard.draft.name.trim();
    const pointer = forestDashboard.draft.contentPointer.trim();
    if (!name || !pointer) {
      setTxStatus({ kind: 'error', message: 'missing_name_or_pointer' });
      return;
    }

    const node = namehash(name);
    const data = encodeSetTextCall(node, 'content', pointer);

    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as unknown;
    const from =
      forestDashboard.selectedAddress ||
      (Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '');
    if (!from) {
      setTxStatus({ kind: 'error', message: 'no_account' });
      return;
    }

    const params = [{ from, to: resolverAddress, data }];

    try {
      await eth.request({ method: 'eth_sendTransaction', params });
      setTxStatus({ kind: 'success', message: 'submitted' });
    } catch (e) {
      setTxStatus({ kind: 'error', message: e instanceof Error ? e.message : 'tx_failed' });
    }
  };

  const preparedTx = useMemo(() => {
    const resolverAddress = forestSettings.resolverAddress.trim();
    const name = forestDashboard.draft.name.trim();
    const pointer = forestDashboard.draft.contentPointer.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(resolverAddress)) return null;
    if (!name || !pointer) return null;
    try {
      const node = namehash(name);
      const data = encodeSetTextCall(node, 'content', pointer);
      return { to: resolverAddress, data };
    } catch {
      return null;
    }
  }, [forestDashboard.draft.contentPointer, forestDashboard.draft.name, forestSettings.resolverAddress]);

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
            className={inputClassName}
            value={forestSettings.rpcUrl}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, rpcUrl: e.target.value }))}
            placeholder="https://mainnet.optimism.io"
          />
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>Resolver Address</div>
          <input
            className={cn(inputClassName, 'font-mono text-sm')}
            value={forestSettings.resolverAddress}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, resolverAddress: e.target.value.trim() }))}
            placeholder="0x..."
          />
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>IPFS Gateway Base URL</div>
          <input
            className={inputClassName}
            value={forestSettings.ipfsGatewayUrl}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, ipfsGatewayUrl: e.target.value }))}
            placeholder="https://cloudflare-ipfs.com/ipfs/"
          />
        </label>

        <label className={cn('grid gap-1')}>
          <div className={cn('text-sm opacity-70')}>IPFS API URL (Kubo)</div>
          <input
            className={inputClassName}
            value={forestSettings.ipfsApiUrl}
            onChange={e => forestSettingsStorage.set(prev => ({ ...prev, ipfsApiUrl: e.target.value }))}
            placeholder="http://127.0.0.1:5001"
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
            className={inputClassName}
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

        <div className={cn('mt-6 border-t pt-6', isLight ? 'border-gray-200' : 'border-gray-700')} />
        <div className={cn('text-lg font-semibold')}>Dashboard</div>

        <div className={cn('grid gap-2')}>
          <div className={cn('text-sm opacity-70')}>Selected Address</div>
          <div className={cn('flex items-center gap-2')}>
            <input
              className={cn(inputClassName, 'font-mono text-sm')}
              value={forestDashboard.selectedAddress}
              readOnly
            />
            <ToggleButton onClick={connectWallet}>Connect</ToggleButton>
          </div>
          {txStatus.kind !== 'idle' ? (
            <div className={cn('text-sm')}>
              Status: <code>{txStatus.kind}</code> {txStatus.message ? <code>{txStatus.message}</code> : null}
            </div>
          ) : null}
        </div>

        <div className={cn('grid gap-2')}>
          <div className={cn('text-sm opacity-70')}>Names</div>
          <div className={cn('flex items-center gap-2')}>
            <input
              className={inputClassName}
              value={nameDraftInput}
              onChange={e => setNameDraftInput(e.target.value)}
              placeholder="alice.forest.mushroom.box"
            />
            <ToggleButton onClick={addName}>Add</ToggleButton>
          </div>
          {forestDashboard.names.length ? (
            <div className={cn('space-y-1 text-sm')}>
              {forestDashboard.names.map(n => (
                <button
                  key={n}
                  className={cn(
                    'block w-full rounded border px-3 py-2 text-left',
                    isLight ? 'border-gray-200' : 'border-gray-700',
                  )}
                  onClick={() => forestDashboardStorage.set(prev => ({ ...prev, draft: { ...prev.draft, name: n } }))}>
                  <code>{n}</code>
                </button>
              ))}
            </div>
          ) : (
            <div className={cn('text-sm opacity-70')}>No names yet.</div>
          )}
        </div>

        <div className={cn('grid gap-3')}>
          <div className={cn('text-sm opacity-70')}>Profile Draft</div>

          <label className={cn('grid gap-1')}>
            <div className={cn('text-sm opacity-70')}>Name</div>
            <input
              className={inputClassName}
              value={forestDashboard.draft.name}
              onChange={e =>
                forestDashboardStorage.set(prev => ({ ...prev, draft: { ...prev.draft, name: e.target.value } }))
              }
              placeholder="alice.forest.mushroom.box"
            />
          </label>

          <label className={cn('grid gap-1')}>
            <div className={cn('text-sm opacity-70')}>Title</div>
            <input
              className={inputClassName}
              value={forestDashboard.draft.title}
              onChange={e =>
                forestDashboardStorage.set(prev => ({ ...prev, draft: { ...prev.draft, title: e.target.value } }))
              }
            />
          </label>

          <label className={cn('grid gap-1')}>
            <div className={cn('text-sm opacity-70')}>Description</div>
            <textarea
              className={cn(inputClassName, 'min-h-24')}
              value={forestDashboard.draft.description}
              onChange={e =>
                forestDashboardStorage.set(prev => ({ ...prev, draft: { ...prev.draft, description: e.target.value } }))
              }
            />
          </label>

          <label className={cn('grid gap-1')}>
            <div className={cn('text-sm opacity-70')}>Avatar (URL)</div>
            <input
              className={inputClassName}
              value={forestDashboard.draft.avatar}
              onChange={e =>
                forestDashboardStorage.set(prev => ({ ...prev, draft: { ...prev.draft, avatar: e.target.value } }))
              }
            />
          </label>

          <div className={cn('flex flex-wrap gap-2')}>
            <ToggleButton onClick={uploadToIpfs} disabled={ipfsStatus.kind === 'loading'}>
              Upload profile.json to IPFS
            </ToggleButton>
            <ToggleButton onClick={sendSetContentTx} disabled={!preparedTx}>
              Set onchain content pointer
            </ToggleButton>
          </div>

          {ipfsStatus.kind !== 'idle' ? (
            <div className={cn('text-sm')}>
              IPFS: <code>{ipfsStatus.kind}</code> {ipfsStatus.message ? <code>{ipfsStatus.message}</code> : null}
            </div>
          ) : null}

          <label className={cn('grid gap-1')}>
            <div className={cn('text-sm opacity-70')}>Content Pointer (text: content)</div>
            <input
              className={cn(inputClassName, 'font-mono text-sm')}
              value={forestDashboard.draft.contentPointer}
              onChange={e =>
                forestDashboardStorage.set(prev => ({
                  ...prev,
                  draft: { ...prev.draft, contentPointer: e.target.value },
                }))
              }
              placeholder="ipfs://<cid>"
            />
          </label>

          {preparedTx ? (
            <pre
              className={cn(
                'whitespace-pre-wrap rounded border p-3 text-xs',
                isLight ? 'border-gray-200' : 'border-gray-700',
              )}>
              {JSON.stringify(preparedTx, null, 2)}
            </pre>
          ) : (
            <div className={cn('text-sm opacity-70')}>
              Fill resolver address, name, and content pointer to prepare a tx.
            </div>
          )}
        </div>

        <div className={cn('flex gap-2')}>
          <ToggleButton onClick={exampleThemeStorage.toggle}>{t('toggleTheme')}</ToggleButton>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
