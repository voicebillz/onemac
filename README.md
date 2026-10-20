# $ONEMAC: onemac.xyz

One-page site for the $ONEMAC memecoin on Solana. Plain HTML/CSS/JS on Vercel, no build step.

- `config.js`: token mint, fee wallet, pair symbol, fee %, Big Mac price. Fill in at launch.
- `api/stats.js`: live Big Mac counter (Vercel function). Reads the fee wallet's history from a free
  Solana RPC, values each net inflow at today's Jupiter price, divides by the Big Mac price. Cached 5 min.
  Optional Vercel env vars: `FEE_WALLET` (overrides config), `RPC_URL` (e.g. a free Helius key), `MAX_TX`.
- `assets/`: coin logo and delivery-platform logos (Simple Icons).
- `brand/`: 1500×500 banner (+ 4500×1500) and its source `banner.html`.
