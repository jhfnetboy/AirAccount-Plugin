import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';

const app = express();
const port = 3001;

app.use(cors()); // Configure CORS appropriately for your extension

// Better Auth API handler
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());

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
