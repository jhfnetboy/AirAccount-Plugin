import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { generatePasskeyRegistrationOptions, verifyPasskeyRegistration } from './passkey-service.js';

const app = express();
const port = 3001;

app.use(cors()); // Configure CORS appropriately for your extension
app.use(express.json());

// Manual Passkey Routes (Backup/Custom Flow)
app.post('/api/auth/passkey/generate-registration-options', async (req, res) => {
  try {
    const { email, name } = req.body;
    const options = await generatePasskeyRegistrationOptions(email, name);
    res.json(options);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/passkey/verify-registration', async (req, res) => {
  try {
    const { response, email, name } = req.body;
    const origin = req.get('origin') || '';
    const result = await verifyPasskeyRegistration(response, email, name, origin);
    res.json(result);
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// Better Auth API handler
app.all('/api/auth/*', toNodeHandler(auth));

app.get('/', (req, res) => {
  res.send('Community Server is running!');
});

// Endpoint to associate wallet (example logic)
app.post('/api/v1/auth/associate-wallet', async (req, res) => {
  // This logic would verify the session and then update the user's web3 address
  // For now, we just placeholder it
  res.json({ message: 'Not implemented yet' });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
