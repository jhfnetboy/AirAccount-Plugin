import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db.js';
import * as schema from './schema.js';
import { passkey } from '@better-auth/passkey';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: schema,
  }),
  plugins: [passkey()],
  user: {
    additionalFields: {
      web3AccountAddress: {
        type: 'string',
        required: false,
      },
    },
  },
});
