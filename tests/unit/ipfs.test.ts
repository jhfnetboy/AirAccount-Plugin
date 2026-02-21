import { ipfsUrl, parseIpfsPointer } from '../../pages/renderer/src/ipfs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('parseIpfsPointer parses ipfs://CID/path', () => {
  const pointer = parseIpfsPointer('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/hello.json');
  assert.deepEqual(pointer, {
    cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    path: '/hello.json',
  });
});

test('parseIpfsPointer parses bare CID', () => {
  const pointer = parseIpfsPointer('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
  assert.deepEqual(pointer, { cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', path: '' });
});

test('parseIpfsPointer rejects invalid inputs', () => {
  assert.equal(parseIpfsPointer(''), null);
  assert.equal(parseIpfsPointer('ipfs://'), null);
  assert.equal(parseIpfsPointer('not a cid'), null);
});

test('ipfsUrl normalizes gateway base URL', () => {
  const pointer = parseIpfsPointer('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')!;
  assert.equal(
    ipfsUrl('https://cloudflare-ipfs.com/ipfs', pointer),
    'https://cloudflare-ipfs.com/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  );
});
