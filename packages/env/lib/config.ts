import { config } from '@dotenvx/dotenvx';

const findEnvPath = () => {
  const cwd = process.cwd();
  const markers = ['/packages/', '/pages/', '/tests/'] as const;
  for (const marker of markers) {
    const idx = cwd.indexOf(marker);
    if (idx !== -1) return `${cwd.slice(0, idx)}/.env`;
  }
  return `${cwd.replace(/\/$/, '')}/.env`;
};

export const baseEnv =
  config({
    path: findEnvPath(),
  }).parsed ?? {};

export const dynamicEnvValues = {
  CEB_NODE_ENV: baseEnv.CEB_DEV === 'true' ? 'development' : 'production',
} as const;
