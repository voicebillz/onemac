// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
// Fill in the addresses at launch; the page shows "launching soon" while they are empty.
export const CONFIG = {
  // $ONEMAC token mint (contract address) on Solana.
  tokenMint: "",
  // Wallet that receives the 3% fee. The Big Mac counter reads its incoming transfers.
  feeWallet: "",
  // Pool pair (McDonald's tokenized stock on Solana).
  pairSymbol: "MCD",
  feePct: 3,
  // Price used to turn fees into Big Macs (USD).
  bigMacUsd: 5.79,
};
