# FCC Explorer

Operator tools for [Flare Confidential Compute](https://dev.flare.network/fcc/overview).

Look up an extension id and open the TEE machine that is in `PRODUCTION`, or decode a tee-proxy `GET /info` response: machine identity, attested ledger state, and Confidential Space claims.

Built with **Next.js** (App Router), **TypeScript**, **wagmi** / **viem**, and [`@flarenetwork/flare-wagmi-periphery-package`](https://www.npmjs.com/package/@flarenetwork/flare-wagmi-periphery-package) for typed `IMachineManager` / `IExtensionManager` reads.

## Run the UI

Needs Node 20+.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

```bash
npm run build && npm start
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

Enter an extension id (decimal or `0x` hex) on Coston2 or Coston. The app calls `IMachineManager.getActiveTeeMachines` and loads `GET /info` from the registered production proxy. You can still paste a proxy URL or a saved JSON body.

## Layout

```
fcc-explorer/
  app/                 # Next.js App Router (UI + API routes)
  components/          # React explorer UI + wagmi on-chain panel
  lib/                 # analyze, chain (viem + Flare ABIs), instruction-sender, wagmi config
  cli.ts               # same decode on the terminal
```
