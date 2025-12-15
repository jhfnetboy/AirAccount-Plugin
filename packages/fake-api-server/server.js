import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { Buffer } from 'node:buffer';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();
const port = 8088;

app.use(cors());
app.use(express.json());

// In-memory store for challenges and users for simplicity.
// In a real app, use a database.
const userStore = {};
const challengeStore = {};

const rpID = 'localhost';
const protocol = 'http';
const origin = `${protocol}://${rpID}:${port}`;

/**
 * Read the database from db.json
 */
async function readDB() {
  try {
    const db = await fs.readFile('./db.json', 'utf-8');
    return JSON.parse(db);
  } catch (e) {
    console.error('Error reading db.json, returning empty db.', e);
    return { users: [], accounts: [], challenges: {} };
  }
}

/**
 * Write to the database
 * @param {object} data
 */
async function writeDB(data) {
  await fs.writeFile('./db.json', JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Fake API server is running' });
});

app.post('/api/v1/auth/register-challenge', async (req, res) => {
  const { userId, username, rpID: clientRpID } = req.body;

  if (!userId || !username) {
    return res.status(400).json({ error: 'userId and username are required' });
  }

  const effectiveRpID = clientRpID || rpID;
  console.log('Generating registration options with rpID:', effectiveRpID);

  const db = await readDB();
  const user = db.users.find(u => u.id === userId);

  if (user) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const registrationOptions = await generateRegistrationOptions({
    rpID: effectiveRpID,
    rpName: 'Passkey Demo',
    userID: new Uint8Array(Buffer.from(userId)),
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  // Store challenge and rpID
  db.challenges[userId] = { challenge: registrationOptions.challenge, rpID: effectiveRpID };
  await writeDB(db);

  res.json(registrationOptions);
});

app.post('/api/v1/auth/register-verify', async (req, res) => {
  const { userId, cred } = req.body;

  if (!userId || !cred) {
    return res.status(400).send({ error: 'Missing userId or credential' });
  }

  const db = await readDB();
  const challengeData = db.challenges[userId];

  if (!challengeData) {
    return res.status(400).send({ error: 'Challenge not found for user' });
  }

  const { challenge: expectedChallenge, rpID: expectedRPID } = challengeData;

  console.log('Verifying registration:', { userId, expectedRPID });

  const origin = req.get('origin');
  const isAllowedOrigin = origin && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost'));

  if (!isAllowedOrigin) {
    return res.status(400).send({ error: `Invalid origin: ${origin}` });
  }

  try {
    const expectedOrigin = origin => {
      return origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost');
    };

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: cred,
        expectedChallenge: expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: expectedRPID,
      });
    } catch (e) {
      if (e.message.includes('Unexpected RP ID hash')) {
        console.log('Retrying verification with prefixed RP ID...');
        // Try with chrome-extension:// prefix
        verification = await verifyRegistrationResponse({
          response: cred,
          expectedChallenge: expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: `chrome-extension://${expectedRPID}`,
        });
      } else {
        throw e;
      }
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credentialPublicKey, credentialID, counter } = registrationInfo;

      // TODO: Create a proper web3 account address
      const web3Address = `0x${Buffer.from(credentialID).toString('hex').slice(0, 40)}`;

      const newUser = {
        id: userId,
        username: `user_${userId}`, // Placeholder
        web3_account_address: web3Address,
      };

      const newAccount = {
        address: web3Address,
        passkey_credential_id: Buffer.from(credentialID).toString('base64'),
        passkey_public_key: Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        authenticators: [
          {
            credentialID: Buffer.from(credentialID).toString('base64'),
            credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64'),
            counter,
          },
        ],
      };

      db.users.push(newUser);
      db.accounts.push(newAccount);
      delete db.challenges[userId]; // Clean up challenge

      await writeDB(db);

      return res.status(200).json({ status: 'ok', verified: true, user: newUser });
    } else {
      return res.status(400).send({ error: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
});

app.post('/api/v1/auth/login-challenge', async (req, res) => {
  const db = await readDB();
  const accounts = db.accounts;

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: accounts.map(acc => ({
      id: Buffer.from(acc.passkey_credential_id, 'base64'),
      type: 'public-key',
    })),
    userVerification: 'required',
  });

  // Store challenge temporarily. For simplicity, we'll use a single challenge for all logins.
  // In a real app, associate this with a session.
  db.challenges['login_challenge'] = options.challenge;
  await writeDB(db);

  res.json(options);
});

app.post('/api/v1/auth/login-verify', async (req, res) => {
  const { cred } = req.body;

  if (!cred) {
    return res.status(400).send({ error: 'Missing credential' });
  }

  const db = await readDB();
  const expectedChallenge = db.challenges['login_challenge'];
  const authenticator = db.accounts.find(acc => acc.passkey_credential_id === cred.id);

  if (!authenticator) {
    return res.status(400).send({ error: 'Authenticator not recognized' });
  }

  const origin = req.get('origin');
  const isAllowedOrigin = origin && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost'));

  if (!isAllowedOrigin) {
    return res.status(400).send({ error: `Invalid origin: ${origin}` });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: cred,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(authenticator.passkey_credential_id, 'base64'),
        credentialPublicKey: Buffer.from(authenticator.passkey_public_key, 'base64'),
        counter: authenticator.counter,
      },
    });

    const { verified } = verification;

    if (verified) {
      // Update the authenticator's counter
      authenticator.counter = verification.authenticationInfo.newCounter;
      delete db.challenges['login_challenge']; // Clean up challenge
      await writeDB(db);

      const user = db.users.find(u => u.web3_account_address === authenticator.address);

      return res.status(200).json({ status: 'ok', verified: true, user });
    } else {
      return res.status(400).send({ error: 'Verification failed' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal server error' });
  }
});

app.get('/api/v1/web3/query-account', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const db = await readDB();
  const user = db.users.find(u => u.id === userId);

  if (user) {
    res.json({ address: user.web3_account_address });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.listen(port, () => {
  console.log(`Fake API server listening at http://localhost:${port}`);
});
