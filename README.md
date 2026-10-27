# FCC Explorer

Operator tools for [Flare Confidential Compute](https://dev.flare.network/).

The first tool decodes a tee-proxy `GET /info` response: machine identity, attested ledger state, and Confidential Space claims.

## Run the UI

Needs Node 18+ (uses global `fetch`). No install step.

```bash
npm start
```

Open [http://127.0.0.1:3456](http://127.0.0.1:3456).

```bash
PORT=4000 HOST=0.0.0.0 npm start
```

## CLI

```bash
npm run cli
npm run cli -- http://127.0.0.1:52699/info
curl -sS http://35.195.12.247:6662/info | npm run cli -- --stdin
```

## What it shows

| Section | Fields |
|---|---|
| Machine (`/info`) | Extension id, platform, chain, TEE address, initial owner, code/governance hashes, signing policies, timestamp |
| On-chain ([`IMachineManager`](https://dev.flare.network/fcc/reference/IMachineManager)) | `getTeeMachineStatus` (`NONE`…`BANNED`), owner, tee proxy id, registered URL (vs fetch URL), last status change, optional initial TEE id, active peers for the extension |
| Instruction sender | Registry address; if verified on the explorer, ABI methods; recent transactions |
| Ledger state | Hex `teeInfo.state.state` decoded as UTF-8 JSON (when the extension publishes one) |
| Attestation | JWT claims from Google Confidential Space (`hwmodel`, `sub`, `dbgstat`, …) or test `magic_pass` |

Enter a live proxy URL (sandbox/local presets in the UI) or paste a saved JSON body.

## Layout

```
fcc-explorer/
  server.mjs       # static UI + /api/analyze + /api/instruction-sender
  cli.mjs          # same decode on the terminal
  lib/analyze.mjs
  lib/chain.mjs
  lib/instruction-sender.mjs
  lib/keccak256.mjs
  public/
```
