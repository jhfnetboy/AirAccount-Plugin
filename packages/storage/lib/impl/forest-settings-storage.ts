import { createStorage, StorageEnum } from '../base/index.js';

export type ForestSettings = {
  rpcUrl: string;
  resolverAddress: string;
  ipfsGatewayUrl: string;
  ipfsApiUrl: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
};

export const forestSettingsStorage = createStorage<ForestSettings>(
  'forest-settings-key',
  {
    rpcUrl: 'https://mainnet.optimism.io',
    resolverAddress: '',
    ipfsGatewayUrl: 'https://cloudflare-ipfs.com/ipfs/',
    ipfsApiUrl: 'http://127.0.0.1:5001',
    cacheEnabled: true,
    cacheTtlSeconds: 300,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
