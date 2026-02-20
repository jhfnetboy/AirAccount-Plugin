import { t as t_dev } from './i18n-dev.js';
import { t as t_prod } from './i18n-prod.js';
import { IS_DEV } from '@extension/env';

export const t = IS_DEV ? t_dev : t_prod;
