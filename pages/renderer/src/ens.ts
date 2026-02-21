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
        b[newX + 5 * newY] = rotl64(lane, ROTATION_OFFSETS[y][x]);
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
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
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
    for (let j = 0; j < 8; j++) {
      lane |= BigInt(block[i * 8 + j]!) << (8n * BigInt(j));
    }
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

const functionSelector = (signature: string) => {
  const bytes = new TextEncoder().encode(signature);
  return keccak256(bytes).subarray(0, 4);
};

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

const encodeContenthashCall = (node: string) => {
  const selector = functionSelector('contenthash(bytes32)');
  const nodeBytes = hexToBytes(node);
  if (nodeBytes.length !== 32) throw new Error('invalid_node');
  return `0x${bytesToHex(concatBytes(selector, nodeBytes))}`;
};

const encodeTextCall = (node: string, key: string) => {
  const selector = functionSelector('text(bytes32,string)');
  const nodeBytes = hexToBytes(node);
  if (nodeBytes.length !== 32) throw new Error('invalid_node');

  const keyBytes = new TextEncoder().encode(key);
  const offsetToString = uint256ToBytes32(64);
  const stringLen = uint256ToBytes32(keyBytes.length);
  const paddedKey = new Uint8Array(Math.ceil(keyBytes.length / 32) * 32).fill(0);
  paddedKey.set(keyBytes, 0);

  const head = concatBytes(nodeBytes, offsetToString);
  const tail = concatBytes(stringLen, paddedKey);
  return `0x${bytesToHex(concatBytes(selector, concatBytes(head, tail)))}`;
};

const readUint256 = (data: Uint8Array, offset: number) => {
  if (offset + 32 > data.length) return null;
  let v = 0n;
  for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(data[offset + i]!);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return v;
  return Number(v);
};

const decodeAbiString = (result: string) => {
  if (result === '0x' || result.length < 2) return null;
  const bytes = hexToBytes(result);
  if (bytes.length < 64) return null;
  const offset = readUint256(bytes, 0);
  if (offset == null) return null;
  const off = typeof offset === 'bigint' ? Number(offset) : offset;
  const len = readUint256(bytes, off);
  if (len == null) return null;
  const l = typeof len === 'bigint' ? Number(len) : len;
  const start = off + 32;
  if (start + l > bytes.length) return null;
  return new TextDecoder().decode(bytes.subarray(start, start + l));
};

const decodeAbiBytes = (result: string) => {
  if (result === '0x' || result.length < 2) return null;
  const bytes = hexToBytes(result);
  if (bytes.length < 64) return null;
  const offset = readUint256(bytes, 0);
  if (offset == null) return null;
  const off = typeof offset === 'bigint' ? Number(offset) : offset;
  const len = readUint256(bytes, off);
  if (len == null) return null;
  const l = typeof len === 'bigint' ? Number(len) : len;
  const start = off + 32;
  if (start + l > bytes.length) return null;
  return bytes.subarray(start, start + l);
};

const formatHexBytes = (bytes: Uint8Array) => `0x${bytesToHex(bytes)}`;

export { decodeAbiBytes, decodeAbiString, encodeContenthashCall, encodeTextCall, formatHexBytes, keccak256, namehash };
