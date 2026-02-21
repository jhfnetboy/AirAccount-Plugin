import { keccak256, namehash } from '../../pages/renderer/src/ens.js';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const bytesToHex = (bytes: Uint8Array) => {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
};

test('keccak256("") matches known vector', () => {
  const digest = keccak256(new Uint8Array());
  assert.equal(`0x${bytesToHex(digest)}`, '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
});

test('namehash("") is 0x00..00', () => {
  assert.equal(namehash(''), `0x${'00'.repeat(32)}`);
});

test('namehash("eth") matches known ENS vector', () => {
  assert.equal(namehash('eth'), '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
});

test('namehash lowercases input', () => {
  assert.equal(namehash('ETH'), namehash('eth'));
});
