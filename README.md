# $ONEMAC: onemac.xyz

One-page site for the $ONEMAC memecoin on Solana. Plain HTML/CSS/JS on Vercel, no build step.

- `config.js`: contract address, launch time, creator wallet and its pump.fun reward vaults, treasury wallet, Big Mac price.
  Big Macs = (SOL rewards claimed since launch + SOL waiting in the vaults above the pre-launch baseline) × SOL price ÷ Big Mac price.
  Treasury = every SOL/token balance in the treasury wallet, priced with Jupiter.
- `api/stats.js`: live Big Mac counter (Vercel function). Reads the fee wallet's history from a free
  Solana RPC, values each net inflow at today's Jupiter price, divides by the Big Mac price. Cached 5 min.
  Optional Vercel env vars: `RPC_URL` (e.g. a free Helius key), `MAX_TX`.
- `assets/`: coin logo and the delivery platforms' own app icons (Wolt included).
- `brand/`: 1500×500 banner (+ 4500×1500) and its source `banner.html`.
