# expt.fun Mobile

React Native mobile app for browsing and interacting with experiments on expt.fun.

## Tech Stack

- **Expo 54** + **Expo Router 5** (file-based routing)
- **React Native 0.81**
- **@solana/web3.js v1** (direct RPC, no Anchor)
- **TypeScript 5.9**

## Architecture

### Data Layer (`lib/api.ts`)

The mobile app reads on-chain `ExptConfig` accounts directly via `@solana/web3.js`
`getProgramAccounts` — **no `@expt/sdk` or `@coral-xyz/anchor`** dependency.

This avoids Node.js built-in modules (`crypto`, `fs`, etc.) that are unavailable
in React Native. Instead, the app includes a manual zero-copy deserializer that
reads the raw account buffer byte-by-byte, matching the Rust struct layout:

- **ExptConfig**: 8 (discriminator) + 1760 (struct) = 1768 bytes
- **Milestone**: 408 bytes each, 3 inline

> **Why not use `@expt/sdk`?**
> The SDK depends on `@coral-xyz/anchor` which imports `createHash` from Node's
> `crypto` module — unavailable in React Native. Installing crypto polyfills
> pulls in a large chain of Node shims. Manual deserialization is simpler and
> has zero extra dependencies.

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Browse | `/(tabs)/browse` | Lists all experiments with status filters |
| Profile | `/(tabs)/profile` | Shows builder's experiments (wallet-connected) |
| Detail | `/experiment/[address]` | Full experiment view with milestones |

### Polyfills

`@solana/web3.js` requires `crypto.getRandomValues()` which React Native doesn't
provide natively. The app uses `react-native-get-random-values` — imported as the
**very first line** in `app/_layout.tsx` (must be before any `@solana/web3.js` import).

## Setup

```bash
cd apps/mobile
npm install
```

## Running

```bash
# Start Metro bundler (clear cache)
npm run start -- --clear

# Then press 'a' for Android emulator or 'i' for iOS simulator
```

## RPC Configuration

The app defaults to **localnet**:

| Platform | Default RPC URL | Why |
|----------|----------------|-----|
| Android emulator | `http://10.0.2.2:8899` | `10.0.2.2` maps to host's `localhost` |
| iOS simulator | `http://localhost:8899` | Direct localhost access |

### Overriding the RPC URL

Set the `EXPO_PUBLIC_SOLANA_RPC_URL` environment variable:

```bash
# For devnet
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com npm run start -- --clear

# For a physical device on the same network (use your Mac's LAN IP)
EXPO_PUBLIC_SOLANA_RPC_URL=http://192.168.1.100:8899 npm run start -- --clear
```

Or create a `.env` file:

```env
EXPO_PUBLIC_SOLANA_RPC_URL=http://192.168.1.100:8899
```

> **Physical Device Note:** `localhost` and `10.0.2.2` won't work on physical
> devices. Use your Mac's LAN IP (visible in `ifconfig` or System Settings → Wi-Fi).

## On-Chain Layout Reference

The deserializer in `lib/api.ts` matches the Rust struct at
`programs/expt/src/state/expt_config.rs`. If the on-chain layout changes,
update the byte offsets in the deserializer accordingly.

Key constants (from `programs/expt/src/constants.rs`):

| Constant | Value |
|----------|-------|
| `MAX_NAME_LEN` | 32 |
| `MAX_URI_LEN` | 200 |
| `MAX_MILESTONE_DESC_LEN` | 128 |
| `MAX_DELIVERABLE_LEN` | 200 |
| `MAX_MILESTONES` | 3 |

Program ID: `9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw`

## Known Warnings

- `@noble/hashes/crypto.js` export subpath warning — harmless, `@solana/web3.js` internal
- `rpc-websockets` platform mismatch — harmless, falls back to file resolution
- Package version compatibility warnings — can be updated but not blocking
