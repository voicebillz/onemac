// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
export const CONFIG = {
  // Solana wallet that launched $ONEMAC on pump.fun. The site finds the coin's
  // contract address from its create transaction, so tokenMint can stay empty.
  creatorWallet: "",
  // Set only to override the auto-detected contract address.
  tokenMint: "",
  // Wallet that receives the creator fees (defaults to creatorWallet).
  feeWallet: "",
  // Pool pair (McDonald's tokenized stock on Solana).
  pairSymbol: "MCD",
  // pump.fun creator fee on every trade, paid in the paired MCD token.
  feePct: 3,
  // Price used to turn fees into Big Macs (USD).
  bigMacUsd: 5.79,
};
