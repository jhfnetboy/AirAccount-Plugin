import { buildForestUpdateTextTypedData } from '@extension/shared';
import { createWalletClient, encodeFunctionData, http, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
    for (let x = 0; x < 5; x++) c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    for (let x = 0; x < 5; x++) d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;

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
      for (let j = 0; j < 8; j++) lane |= BigInt(data[offset + i * 8 + j]!) << (8n * BigInt(j));
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

const namehash = (name: string) => {
  let node = new Uint8Array(32).fill(0);
  const normalized = name.trim().toLowerCase();
  if (!normalized) return `0x${bytesToHex(node)}`;
  const labels = normalized.split('.').filter(Boolean);
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(new TextEncoder().encode(labels[i]!));
    node = keccak256(concatBytes(node, labelHash));
  }
  return `0x${bytesToHex(node)}` as `0x${string}`;
};

const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);
const isBytes32 = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);
const isSignature = (value: string) => /^0x[a-fA-F0-9]{130}$/.test(value);

const json = (res: ServerResponse, status: number, data: unknown) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
};

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body.trim()) return null;
  return JSON.parse(body) as unknown;
};

const getIp = (req: IncomingMessage) => {
  const ip = req.socket.remoteAddress || '';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
};

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const rateByIp = new Map<string, { windowStart: number; count: number }>();

const checkRateLimit = (ip: string) => {
  const now = Date.now();
  const current = rateByIp.get(ip);
  if (!current || now - current.windowStart > WINDOW_MS) {
    rateByIp.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_PER_WINDOW) return false;
  current.count += 1;
  return true;
};

const usedNonces = new Map<string, Map<string, number>>();

const rememberNonce = (owner: string, nonce: string) => {
  const map = usedNonces.get(owner) ?? new Map<string, number>();
  if (map.has(nonce)) return false;
  map.set(nonce, Date.now());
  usedNonces.set(owner, map);
  return true;
};

const resolverAbi = [
  {
    type: 'function',
    name: 'setText',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const;

const main = () => {
  const port = Number(process.env.FOREST_RELAYER_PORT || 8787);
  const privateKey = (process.env.FOREST_RELAYER_PRIVATE_KEY || '').trim();
  const rpcUrl = (process.env.FOREST_RELAYER_RPC_URL || '').trim();
  const envChainId = (process.env.FOREST_RELAYER_CHAIN_ID || '').trim();
  const envResolver = (process.env.FOREST_RELAYER_RESOLVER_ADDRESS || '').trim();

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error('FOREST_RELAYER_PRIVATE_KEY must be 0x + 64 hex');
  if (!/^https?:\/\/.+/i.test(rpcUrl)) throw new Error('FOREST_RELAYER_RPC_URL must be an http(s) URL');
  if (envChainId && !/^\d+$/.test(envChainId)) throw new Error('FOREST_RELAYER_CHAIN_ID must be an integer');
  if (envResolver && !isAddress(envResolver)) throw new Error('FOREST_RELAYER_RESOLVER_ADDRESS must be an address');

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const chainId = envChainId ? Number(envChainId) : 10;

  const chain = {
    id: chainId,
    name: 'ForestChain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method !== 'POST' || url.pathname !== '/v1/forest/update-text') {
      json(res, 404, { error: 'not_found' });
      return;
    }

    const ip = getIp(req);
    if (!checkRateLimit(ip)) {
      json(res, 429, { error: 'rate_limited' });
      return;
    }

    try {
      const body = (await readJsonBody(req)) as null | {
        typedData?: unknown;
        signature?: unknown;
        rpcUrl?: unknown;
        resolverAddress?: unknown;
      };
      if (!body || typeof body !== 'object') {
        json(res, 400, { error: 'bad_json' });
        return;
      }

      const signature = typeof body.signature === 'string' ? body.signature : '';
      if (!isSignature(signature)) {
        json(res, 400, { error: 'invalid_signature' });
        return;
      }

      const typedData = body.typedData as ReturnType<typeof buildForestUpdateTextTypedData> | undefined;
      if (!typedData || typeof typedData !== 'object') {
        json(res, 400, { error: 'missing_typed_data' });
        return;
      }

      const domain = typedData.domain as unknown as {
        name?: unknown;
        version?: unknown;
        chainId?: unknown;
        verifyingContract?: unknown;
      };
      const message = typedData.message as unknown as {
        owner?: unknown;
        name?: unknown;
        key?: unknown;
        value?: unknown;
        nonce?: unknown;
        deadline?: unknown;
      };

      const domainName = typeof domain?.name === 'string' ? domain.name : '';
      const domainVersion = typeof domain?.version === 'string' ? domain.version : '';
      const domainChainId = typeof domain?.chainId === 'number' ? domain.chainId : Number(domain?.chainId);
      const verifyingContract = typeof domain?.verifyingContract === 'string' ? domain.verifyingContract : '';

      if (domainName !== 'ForestController' || domainVersion !== '1') {
        json(res, 400, { error: 'invalid_domain' });
        return;
      }
      if (!Number.isFinite(domainChainId) || domainChainId !== chainId) {
        json(res, 400, { error: 'invalid_chain_id' });
        return;
      }
      if (!isAddress(verifyingContract)) {
        json(res, 400, { error: 'invalid_verifying_contract' });
        return;
      }
      if (envResolver && verifyingContract.toLowerCase() !== envResolver.toLowerCase()) {
        json(res, 400, { error: 'resolver_mismatch' });
        return;
      }

      const owner = typeof message.owner === 'string' ? message.owner : '';
      const name = typeof message.name === 'string' ? message.name : '';
      const key = typeof message.key === 'string' ? message.key : '';
      const value = typeof message.value === 'string' ? message.value : '';
      const nonce = typeof message.nonce === 'string' ? message.nonce : '';
      const deadline = typeof message.deadline === 'string' ? message.deadline : '';

      if (!isAddress(owner)) {
        json(res, 400, { error: 'invalid_owner' });
        return;
      }
      if (!name || !key) {
        json(res, 400, { error: 'invalid_message' });
        return;
      }

      if (!nonce || !/^\d+$/.test(nonce)) {
        json(res, 400, { error: 'invalid_nonce' });
        return;
      }
      if (!deadline || !/^\d+$/.test(deadline)) {
        json(res, 400, { error: 'invalid_deadline' });
        return;
      }
      if (Number(deadline) < Math.floor(Date.now() / 1000)) {
        json(res, 400, { error: 'expired' });
        return;
      }
      if (!rememberNonce(owner.toLowerCase(), nonce)) {
        json(res, 400, { error: 'replay' });
        return;
      }

      const expected = buildForestUpdateTextTypedData({
        chainId,
        verifyingContract: verifyingContract as `0x${string}`,
        owner: owner as `0x${string}`,
        name,
        key,
        value,
        nonce,
        deadline,
      });

      const ok = await verifyTypedData({
        address: owner as `0x${string}`,
        domain: expected.domain,
        types: { ForestUpdateText: expected.types.ForestUpdateText },
        primaryType: 'ForestUpdateText',
        message: expected.message,
        signature: signature as `0x${string}`,
      });

      if (!ok) {
        json(res, 400, { error: 'bad_signature' });
        return;
      }

      const node = namehash(name);
      if (!isBytes32(node)) {
        json(res, 400, { error: 'invalid_node' });
        return;
      }
      const nodeHex = node as `0x${string}`;

      const data = encodeFunctionData({
        abi: resolverAbi,
        functionName: 'setText',
        args: [nodeHex, key, value],
      });

      const hash = await walletClient.sendTransaction({
        account,
        to: verifyingContract as `0x${string}`,
        data,
      });

      json(res, 200, { txHash: hash });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : 'server_error' });
    }
  });

  server.listen(port, () => {
    process.stdout.write(`forest-controller listening on http://127.0.0.1:${port}\n`);
  });
};

main();
