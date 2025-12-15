import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from './db.js';
import { user, passkeyChallenge, passkey } from './schema.js';
import { eq } from 'drizzle-orm';
import { Buffer } from 'node:buffer';

const rpName = 'AirAccount';
const rpID = 'ldkhlgkhgnlogoibbdgndgjhangpgfje'; // Extension ID
const origin = `chrome-extension://${rpID}`;

export const generatePasskeyRegistrationOptions = async (email: string, name: string) => {
  // Check if user exists, if not create a temp ID or use email as ID?
  // Standard WebAuthn needs a unique ID. better-auth uses random ID.

  // For this manual flow, we will generate a random user ID for the authenticator
  const userID = crypto.randomUUID();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(userID)),
    userName: email,
    userDisplayName: name,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  // Save challenge to DB
  // Upsert challenge
  const existing = await db.select().from(passkeyChallenge).where(eq(passkeyChallenge.id, email)).get();
  if (existing) {
    await db
      .update(passkeyChallenge)
      .set({
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 60000 * 5),
      })
      .where(eq(passkeyChallenge.id, email));
  } else {
    await db.insert(passkeyChallenge).values({
      id: email, // Using email as key for challenge retrieval
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 60000 * 5), // 5 mins
    });
  }

  return options;
};

export const verifyPasskeyRegistration = async (response: any, email: string, name: string, requestOrigin: string) => {
  // Validate origin manually
  const isAllowedOrigin =
    requestOrigin.startsWith('chrome-extension://') || requestOrigin.startsWith('http://localhost');
  if (!isAllowedOrigin) {
    throw new Error(`Invalid origin: ${requestOrigin}`);
  }

  const challengeRecord = await db.select().from(passkeyChallenge).where(eq(passkeyChallenge.id, email)).get();

  if (!challengeRecord) {
    throw new Error('Challenge not found');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: requestOrigin, // Pass the actual origin
      expectedRPID: rpID,
    });
  } catch (e: any) {
    if (e.message.includes('Unexpected RP ID hash')) {
      console.log('Retrying with prefixed RP ID...');
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: requestOrigin,
        expectedRPID: `chrome-extension://${rpID}`,
      });
    } else {
      throw e;
    }
  }

  if (verification.verified && verification.registrationInfo) {
    console.log('Registration Info:', verification.registrationInfo);
    const { credential } = verification.registrationInfo;
    const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

    if (!credentialID) throw new Error('Missing credentialID from verification');
    if (!credentialPublicKey) throw new Error('Missing credentialPublicKey from verification');

    const userID = crypto.randomUUID(); // Create real user ID now

    // Create User
    await db.insert(user).values({
      id: userID,
      name,
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      web3AccountAddress: `0x${Buffer.from(credentialID, 'base64url').toString('hex').slice(0, 40)}`, // Mock address
    });

    // Create Passkey
    await db.insert(passkey).values({
      id: crypto.randomUUID(),
      name: 'Main Passkey',
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      userId: userID,
      webauthnUserID: userID, // This should technically match the ID used in generation if we want standard compliance, but for 'new' registration it's ok.
      counter,
      deviceType: 'singleDevice', // logic to detect
      backedUp: false, // logic to detect
      transports: '',
      createdAt: new Date(),
    });

    // Clean up challenge
    await db.delete(passkeyChallenge).where(eq(passkeyChallenge.id, email));

    return { verified: true, user: { id: userID, email } };
  }

  throw new Error('Verification failed');
};
