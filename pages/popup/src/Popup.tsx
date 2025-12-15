import '@src/Popup.css';
import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

const FAKE_API_URL = 'http://localhost:8088';

const Popup = () => {
  const [status, setStatus] = useState('');

  const handleRegister = async () => {
    setStatus('Starting registration...');

    // A fake user ID for demonstration purposes
    const userId = `user_${Date.now()}`;
    const username = `${userId}@example.com`;

    try {
      // 1. Get registration options from the server
      const rpID = chrome?.runtime?.id || 'localhost';
      console.log('Sending rpID:', rpID);
      const resp = await fetch(`${FAKE_API_URL}/api/v1/auth/register-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, username, rpID }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        let errorMessage = `Failed to get challenge: ${resp.status} ${resp.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) errorMessage += ` - ${errorJson.error}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const options = await resp.json();
      console.log('Registration options full:', options);
      console.log('RP options:', options.rp);

      // Allow browser to determine the RP ID from the context
      // This helps avoid mismatches if the extension ID format differs
      const rpId = options.rp.id;
      delete options.rp.id;

      setStatus('Got challenge, awaiting user interaction...');

      // 2. Start WebAuthn registration
      const attestation = await startRegistration({ optionsJSON: options });
      setStatus('User interaction complete, verifying...');

      // 3. Send attestation to server for verification
      const verificationResp = await fetch(`${FAKE_API_URL}/api/v1/auth/register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, cred: attestation }),
      });

      const verificationJSON = await verificationResp.json();

      if (verificationJSON && verificationJSON.verified) {
        setStatus(
          `✅ Registration successful! User: ${verificationJSON.user.id}, Address: ${verificationJSON.user.web3_account_address}`,
        );
      } else {
        throw new Error(`Verification failed: ${verificationJSON.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error(error);
    }
  };

  return (
    <div className="min-w-[300px] bg-gray-800 p-4 text-white">
      <header className="flex flex-col items-center">
        <h1 className="mb-4 text-xl font-bold">Passkey Demo</h1>
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

// We are removing the withErrorBoundary and withSuspense for simplicity in this example
export default Popup;
