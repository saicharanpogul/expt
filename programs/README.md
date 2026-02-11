# expt programs

Anchor workspace for the `expt` on-chain program.

## Setup

- **Anchor CLI**: `0.31.1`
- **Solana CLI (Agave)**: `2.1.x`
- **Platform Tools**: `v1.43` (bundles rustc `1.79.0`)

## Known Issues

### Cargo dependency resolution vs platform-tools rustc

Solana's `cargo-build-sbf` (platform-tools v1.43) bundles **rustc 1.79.0**, which is incompatible with newer crate versions that require Rust 1.82+ or `edition2024`.

Affected crates (as of Feb 2026):

| Crate              | Incompatible Version | Requires   | Pinned To |
| ------------------ | -------------------- | ---------- | --------- |
| `blake3`           | `≥ 1.7.0`           | edition2024 (Rust 1.85+) | `1.6.0`   |
| `indexmap`         | `≥ 2.12.0`          | rustc 1.82+ | `2.11.4`  |

**If you delete `Cargo.lock` or run a bare `cargo update`, re-pin with:**

```bash
cargo update -p blake3 --precise 1.6.0
cargo update -p indexmap --precise 2.11.4
```

This will be unnecessary once Solana ships platform-tools with rustc ≥ 1.85.

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```
