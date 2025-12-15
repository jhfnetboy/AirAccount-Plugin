# Gemini Project: AirAccount-Plugin

This file provides a summary of the AirAccount-Plugin project and instructions for interacting with it.

## Project Overview

AirAccount-Plugin is a browser extension boilerplate built with React, TypeScript, Vite, and Turborepo. It supports both Chrome and Firefox and comes with a rich set of features including:

*   **React 19** and **TypeScript** for modern UI development.
*   **Vite** for fast builds and development.
*   **Turborepo** for monorepo management.
*   **Tailwind CSS** for styling.
*   **ESLint** and **Prettier** for code quality.
*   **pnpm** for package management.
*   **Chrome Extension Manifest V3**.
*   **i18n** support.
*   **Hot Module Replacement (HMR)** for a better development experience.
*   **End-to-end testing** with WebdriverIO.

The project is structured as a pnpm workspace with the following main components:

*   `chrome-extension`: The core extension files, including the manifest.
*   `pages`: The different pages of the extension, such as popup, options, and content scripts.
*   `packages`: Shared packages used across the project.
*   `tests`: End-to-end tests.

## Building and Running

### Installation

1.  Clone the repository.
2.  Make sure you have `pnpm` installed (`npm install -g pnpm`).
3.  Install dependencies: `pnpm install`

### Development

*   **Chrome:** `pnpm dev`
*   **Firefox:** `pnpm dev:firefox`

Then, load the `dist` directory as an unpacked extension in your browser.

### Production Build

*   **Chrome:** `pnpm build`
*   **Firefox:** `pnpm build:firefox`

### Running Tests

*   **e2e:** `pnpm e2e`
*   **e2e for firefox:** `pnpm e2e:firefox`

## Development Conventions

*   **Package Management:** This project uses `pnpm` for package management. To install a new dependency in a specific package, use `pnpm i <package> -F <module name>`. To install a dependency in the root, use `pnpm i <package> -w`.
*   **Code Style:** The project uses Prettier for code formatting and ESLint for linting. You can run `pnpm format` to format the code and `pnpm lint` to check for linting errors.
*   **Committing:** The project uses `husky` and `lint-staged` to run Prettier and ESLint before each commit.
*   **Versioning:** Use `pnpm update-version <version>` to update the extension version.
