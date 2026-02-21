import { buildForestUpdateTextTypedData } from '../../packages/shared/lib/utils/forest-typed-data.js';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('buildForestUpdateTextTypedData produces stable shape', () => {
  const typedData = buildForestUpdateTextTypedData({
    chainId: 10,
    verifyingContract: '0x0000000000000000000000000000000000000001',
    owner: '0x0000000000000000000000000000000000000002',
    name: 'alice.forest.mushroom.box',
    key: 'content',
    value: 'ipfs://bafy123',
    nonce: '123',
    deadline: '456',
  });

  assert.equal(typedData.domain.name, 'ForestController');
  assert.equal(typedData.domain.version, '1');
  assert.equal(typedData.domain.chainId, 10);
  assert.equal(typedData.domain.verifyingContract, '0x0000000000000000000000000000000000000001');
  assert.equal(typedData.primaryType, 'ForestUpdateText');

  assert.equal(typedData.message.owner, '0x0000000000000000000000000000000000000002');
  assert.equal(typedData.message.name, 'alice.forest.mushroom.box');
  assert.equal(typedData.message.key, 'content');
  assert.equal(typedData.message.value, 'ipfs://bafy123');
  assert.equal(typedData.message.nonce, '123');
  assert.equal(typedData.message.deadline, '456');

  assert.ok(Array.isArray(typedData.types.EIP712Domain));
  assert.ok(Array.isArray(typedData.types.ForestUpdateText));
});
