import { createStorage, StorageEnum } from '../base/index.js';

export type ForestProfileDraft = {
  name: string;
  title: string;
  description: string;
  avatar: string;
  contentPointer: string;
  lastPublishedCid: string;
};

export type ForestDashboardState = {
  selectedAddress: string;
  names: string[];
  draft: ForestProfileDraft;
};

export const forestDashboardStorage = createStorage<ForestDashboardState>(
  'forest-dashboard-key',
  {
    selectedAddress: '',
    names: [],
    draft: {
      name: '',
      title: '',
      description: '',
      avatar: '',
      contentPointer: '',
      lastPublishedCid: '',
    },
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
