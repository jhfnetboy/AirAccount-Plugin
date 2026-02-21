const isProbablyCid = (value: string) => /^[a-zA-Z0-9]+$/.test(value) && value.length >= 40;

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
    const path = rest.length ? `/${rest.join('/')}` : '';
    return { cid, path };
  }

  if (isProbablyCid(value)) return { cid: value, path: '' };

  return null;
};

const normalizeGatewayBase = (base: string) => {
  const trimmed = base.trim();
  if (!trimmed) return 'https://cloudflare-ipfs.com/ipfs/';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

const ipfsUrl = (gatewayBase: string, pointer: IpfsPointer) =>
  `${normalizeGatewayBase(gatewayBase)}${pointer.cid}${pointer.path}`;

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
