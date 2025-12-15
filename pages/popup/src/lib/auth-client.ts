import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3001', // Make sure this matches your server
  plugins: [passkeyClient()],
});

export const { useSession, signIn, signUp } = authClient;
