import { createStorage, StorageEnum } from '../base/index.js';

export type ForestSettings = {
  chainId: number;
  rpcUrl: string;
  resolverAddress: string;
  ipfsGatewayUrl: string;
  ipfsApiUrl: string;
  relayerUrl: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
};

export const forestSettingsStorage = createStorage<ForestSettings>(
  'forest-settings-key',
  {
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    resolverAddress: '',
    ipfsGatewayUrl: 'https://cloudflare-ipfs.com/ipfs/',
    ipfsApiUrl: 'http://127.0.0.1:5001',
    relayerUrl: 'http://127.0.0.1:8787',
    cacheEnabled: true,
    cacheTtlSeconds: 300,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
