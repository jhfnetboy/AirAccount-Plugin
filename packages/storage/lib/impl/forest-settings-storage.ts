import { createStorage, StorageEnum } from '../base/index.js';

export type ForestSettings = {
  rpcUrl: string;
  resolverAddress: string;
  ipfsGatewayUrl: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
};

export const forestSettingsStorage = createStorage<ForestSettings>(
  'forest-settings-key',
  {
    rpcUrl: 'https://mainnet.optimism.io',
    resolverAddress: '',
    ipfsGatewayUrl: 'https://cloudflare-ipfs.com/ipfs/',
    cacheEnabled: true,
    cacheTtlSeconds: 300,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
