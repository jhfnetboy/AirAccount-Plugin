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
  plugins: [
    passkey({
      rpID: 'ldkhlgkhgnlogoibbdgndgjhangpgfje', // Replace with your actual extension ID if dynamic is not working
      origin: 'chrome-extension://ldkhlgkhgnlogoibbdgndgjhangpgfje',
    }),
  ],
  user: {
    additionalFields: {
      web3AccountAddress: {
        type: 'string',
        required: false,
      },
    },
  },
  debug: true,
  trustedOrigins: ['chrome-extension://', 'http://localhost:3000'],
});
