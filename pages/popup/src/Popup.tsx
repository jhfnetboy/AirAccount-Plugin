import '@src/Popup.css';
import { useState } from 'react';
import { authClient } from './lib/auth-client';
import { startRegistration } from '@simplewebauthn/browser';

const Popup = () => {
  const [status, setStatus] = useState('');

  const handleRegister = async () => {
    setStatus('Starting registration...');

    // A fake user ID for demonstration purposes
    const email = `user_${Date.now()}@example.com`;
    const name = `User ${Date.now()}`;

    console.log('AuthClient Passkey:', authClient.passkey);

    try {
      // 1. Generate Options
      const optionsResp = await authClient.passkey.generateRegistrationOptions({
        email,
        name,
      });

      if (optionsResp.error) {
        throw new Error(optionsResp.error.message);
      }

      const options = optionsResp.data;
      console.log('Registration Options:', options);

      // 2. Start Registration (using simplewebauthn browser, or better-auth's internal helper if exposed, but simplewebauthn is standard)
      // better-auth client usually handles this in signUp, but since signUp failed, we do it manually.
      // We need to import startRegistration again.
      const attestation = await startRegistration({ optionsJSON: options });

      // 3. Verify Registration
      const verifyResp = await authClient.passkey.verifyRegistration({
        response: attestation,
        email,
        name,
      });

      if (verifyResp.error) {
        throw new Error(verifyResp.error.message);
      }

      setStatus('✅ Registration successful!');
      console.log('Registration result', verifyResp.data);
    } catch (error: any) {
      console.error('Registration error:', error);
      setStatus(`❌ Error: ${error.message || JSON.stringify(error) || 'Unknown error'}`);
    }
  };

  return (
    <div className="min-w-[300px] bg-gray-800 p-4 text-white">
      <header className="flex flex-col items-center">
        <h1 className="mb-4 text-xl font-bold">Passkey Demo (Better Auth)</h1>
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={handleRegister}>
          Register with Passkey
        </button>
        <div className="mt-4 min-h-[50px] w-full rounded bg-gray-700 p-2 text-center">
          <p className="break-words text-sm">{status}</p>
        </div>
      </header>
    </div>
  );
};

export default Popup;
