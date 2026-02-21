export type ForestUpdateTextTypedData = {
  domain: {
    name: 'ForestController';
    version: '1';
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    ForestUpdateText: Array<{ name: string; type: string }>;
  };
  primaryType: 'ForestUpdateText';
  message: {
    owner: `0x${string}`;
    name: string;
    key: string;
    value: string;
    nonce: string;
    deadline: string;
  };
};

export const buildForestUpdateTextTypedData = (args: {
  chainId: number;
  verifyingContract: `0x${string}`;
  owner: `0x${string}`;
  name: string;
  key: string;
  value: string;
  nonce: string;
  deadline: string;
}): ForestUpdateTextTypedData => ({
  domain: {
    name: 'ForestController',
    version: '1',
    chainId: args.chainId,
    verifyingContract: args.verifyingContract,
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    ForestUpdateText: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'ForestUpdateText',
  message: {
    owner: args.owner,
    name: args.name,
    key: args.key,
    value: args.value,
    nonce: args.nonce,
    deadline: args.deadline,
  },
});
