# Project Action Plan

This document outlines the development roadmap for building the Passkey-driven Web3 account abstraction wallet.

## Phase 1: MVP - Core Infrastructure and User Onboarding

The goal of this phase is to build the minimum viable product, focusing on the core backend infrastructure and the initial user experience of binding a Web2 identity to a new Web3 account.

### 1. Project Initialization & Scaffolding

-   [x] Add `rickwillcox/react-typescript-chrome-extension-template` as a submodule for reference (`submodules/chrome-template`).
-   [x] Add `better-auth/better-auth` as a submodule for the identity backend (`lib/better-auth`).
-   [ ] **Analyze Codebases:**
    -   [ ] Review `chrome-template` to identify best practices and potential code to merge into our existing boilerplate (e.g., Vite/Rollup configs, manifest generation, HMR).
    -   [ ] Deep-dive into `better-auth` to understand its architecture, database schema, and OAuth flow. Plan the necessary modifications.

### 2. Backend: Community Server Development

-   [ ] **Fork/Copy `better-auth`:** Start building the community server by adapting the `better-auth` codebase.
-   [ ] **Extend Database Schema:** Modify the user database model to include Web3-specific fields:
    -   `web3_account_address` (string, indexed)
    -   `passkey_credential_id` (string)
    -   `passkey_public_key` (string)
-   [ ] **Develop New API Endpoints:**
    -   `POST /api/v1/auth/associate-wallet`: Receives a user's session token and their new Passkey credentials. Creates (or pre-calculates) an ERC-4337 account address and saves the association in the database.
    -   `GET /api/v1/web3/get-wallet-address`: Given a user's session token, returns their associated Web3 wallet address.

### 3. Frontend: Chrome Extension MVP

-   [ ] **UI for Onboarding:**
    -   Create a new flow in the popup/options page.
    -   Step 1: User logs in via Google/GitHub (leveraging the community server's `better-auth` frontend).
    -   Step 2: After successful login, prompt the user to create a Passkey for this service.
-   [ ] **Integrate Passkey (WebAuthn):**
    -   Use the `simple-webauthn` library to handle the Passkey creation flow (`navigator.credentials.create()`).
-   [ ] **Plugin-Server Communication:**
    -   Securely send the user's session token and the newly created Passkey public key/credential ID to the `/api/v1/auth/associate-wallet` endpoint on the community server.
    -   Fetch and display the user's associated Web3 address from the server.

---

## Phase 2: Transactionality and Security

With the user onboarding in place, this phase focuses on enabling actual transactions and implementing the core security model.

-   [ ] **Smart Contracts:**
    -   Choose and deploy a base ERC-4337 `Account` and `AccountFactory` contract (e.g., based on Safe, Biconomy, or Etherspot).
    -   The `Account` contract must support a multi-signature scheme where the Passkey-derived key is one of the signers.
-   [ ] **Backend: Validator & Relayer Logic:**
    -   Implement the Validator logic on the community server to act as a second signer on `UserOperation`.
    -   This service will receive a `UserOperation` signed by the user's Passkey, perform security checks (e.g., against a ruleset), add its signature, and relay it to the Bundler.
    -   `POST /api/v1/web3/relay-transaction`: New endpoint to receive and process the `UserOperation`.
-   [ ] **Frontend: Intent-Driven Signing:**
    -   Develop a UI component that clearly displays the intent of a transaction (e.g., "Pay 0.1 ETH to Vitalik").
    -   When a DApp requests a transaction, the plugin constructs the `UserOperation`, prompts the user for a Passkey signature (`navigator.credentials.get()`), and sends the signed operation to the community server for relaying.

---

## Phase 3: DApp Ecosystem and Decentralization

This phase focuses on expanding the reach of the wallet by making it easy for developers to integrate and by hardening the decentralized aspects of the architecture.

-   [ ] **DApp SDK (JS Library):**
    -   Develop a standalone JavaScript library that DApps can embed.
    -   The SDK will detect if the plugin is installed.
        -   **If installed:** It will communicate with the plugin via `window.postMessage` to request signatures.
        -   **If not installed (fallback):** It will open a popup/iframe to the community server's frontend to handle login and signing directly, providing a "plugin-less" experience.
-   [ ] **Multi-Server Support:**
    -   Implement an "Options" page in the plugin where users can specify the URL of their preferred community server.
    -   Ensure the DApp SDK can also be configured to point to a specific community server.
-   [ ] **Gas Abstraction (Paymaster):**
    -   Integrate or build an ERC-4337 `Paymaster` service to sponsor transactions for users, further lowering the barrier to entry.

---

I have added the submodules and created a `PLAN.md` file to outline the development plan. The next steps are to analyze the newly added code and start working on the MVP.
