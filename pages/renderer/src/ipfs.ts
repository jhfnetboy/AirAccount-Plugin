const isCidV0Base58btc = (value: string) => {
  if (value.length < 40 || value.length > 100) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return false;
  return value.startsWith('Qm');
};

const isCidV1Base32 = (value: string) => {
  if (value.length < 50 || value.length > 200) return false;
  if (!/^[a-z2-7]+$/.test(value)) return false;
  return value.startsWith('b');
};

const isProbablyCid = (value: string) => isCidV0Base58btc(value) || isCidV1Base32(value);

type IpfsPointer = { cid: string; path: string };

type AllowedBundle =
  | { kind: 'json'; cid: string; text: string; json: unknown }
  | { kind: 'markdown'; cid: string; text: string }
  | { kind: 'image'; cid: string; url: string }
  | { kind: 'unknown'; cid: string; url: string; contentType: string | null };

const parseIpfsPointer = (raw: string): IpfsPointer | null => {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith('ipfs://')) {
    const withoutScheme = value.slice('ipfs://'.length);
    const [cid, ...rest] = withoutScheme.split('/');
    if (!cid || !isProbablyCid(cid)) return null;
    const pathRaw = rest.length ? rest.join('/') : '';
    if (pathRaw.length > 2048) return null;
    if (pathRaw.split('/').some(seg => seg === '..')) return null;
    const path = pathRaw ? `/${pathRaw}` : '';
    return { cid, path };
  }

  if (isProbablyCid(value)) return { cid: value, path: '' };

  return null;
};

const normalizeGatewayBase = (base: string) => {
  const trimmed = base.trim();
  if (!trimmed) return 'https://cloudflare-ipfs.com/ipfs/';
  try {
    const url = new URL(trimmed.endsWith('/') ? trimmed : `${trimmed}/`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'https://cloudflare-ipfs.com/ipfs/';
    return url.toString();
  } catch {
    return 'https://cloudflare-ipfs.com/ipfs/';
  }
};

const encodeIpfsPath = (path: string) => {
  if (!path) return '';
  const parts = path.split('/');
  return parts.map((p, i) => (i === 0 ? p : encodeURIComponent(p))).join('/');
};

const ipfsUrl = (gatewayBase: string, pointer: IpfsPointer) =>
  `${normalizeGatewayBase(gatewayBase)}${pointer.cid}${encodeIpfsPath(pointer.path)}`;

const fetchIpfsBundle = async (gatewayBase: string, pointer: IpfsPointer): Promise<AllowedBundle> => {
  const url = ipfsUrl(gatewayBase, pointer);

  const response = await fetch(url, { method: 'GET' });
  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    throw new Error(`ipfs_http_${response.status}`);
  }

  const ct = (contentType ?? '').toLowerCase();

  if (ct.startsWith('image/')) {
    return { kind: 'image', cid: pointer.cid, url };
  }

  const text = await response.text();
  if (text.length > 500_000) {
    throw new Error('ipfs_too_large');
  }

  if (ct.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      const json = JSON.parse(text) as unknown;
      return { kind: 'json', cid: pointer.cid, text, json };
    } catch {
      return { kind: 'markdown', cid: pointer.cid, text };
    }
  }

  return { kind: 'markdown', cid: pointer.cid, text };
};

export { fetchIpfsBundle, ipfsUrl, parseIpfsPointer };
export type { AllowedBundle, IpfsPointer };
