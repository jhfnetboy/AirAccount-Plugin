import setRelatedLocaleImports from './set-related-locale-import.js';
import { IS_DEV } from '@extension/env';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

(() => {
  const outDir = resolve(import.meta.dirname, '..', '..', '..', '..', 'dist');
  if (!existsSync(outDir)) {
    mkdirSync(outDir);
  }

  const localePath = resolve(outDir, '_locales');
  cpSync(resolve('locales'), localePath, { recursive: true });

  if (IS_DEV) {
    setRelatedLocaleImports();
  }
  console.log('I18n build complete');
})();
