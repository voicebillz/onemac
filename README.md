# $ONEMAC: onemac.xyz

One-page site for the $ONEMAC memecoin on Solana. Plain HTML/CSS/JS on Vercel, no build step.

- `config.js`: creator wallet (Solana), optional token mint / fee wallet, pair, fee %, Big Mac price.
  With only `creatorWallet` set, `/api/stats` finds the pump.fun contract address from the launch transaction.
- `api/stats.js`: live Big Mac counter (Vercel function). Reads the fee wallet's history from a free
  Solana RPC, values each net inflow at today's Jupiter price, divides by the Big Mac price. Cached 5 min.
  Optional Vercel env vars: `CREATOR_WALLET`, `FEE_WALLET` (override config), `RPC_URL` (e.g. a free Helius key), `MAX_TX`.
- `assets/`: coin logo and the delivery platforms' own app icons (Wolt included).
- `brand/`: 1500×500 banner (+ 4500×1500) and its source `banner.html`.
