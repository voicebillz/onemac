// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
export const CONFIG = {
  // $ONEMAC on pump.fun (contract address).
  tokenMint: "DnspStwz9cn4EsFziuDbtBq5REbBHNKGia2MeVMcpump",
  // Wallet that launched $ONEMAC; pump.fun pays the creator fees to it when claimed.
  creatorWallet: "DzBgwpHP5ZYCEcGdA1rmHERqUuzx2LzRt66CobdBgk1U",
  // Where unclaimed creator fees wait (PDAs of creatorWallet):
  // pump.fun bonding curve vault (SOL) and PumpSwap vault (wrapped SOL, after graduation).
  creatorVaults: {
    curve: "xyLSZ7BqX2z35FZoJfarTs4izmPYyXrmkpGG3ZtufWv",
    pumpswap: "D8eGVYZySkxwK7tTs9T2DNoNJ71JyM49WbFjncBVJjNo",
  },
  // Optional: a different wallet that receives the fees (defaults to creatorWallet).
  feeWallet: "",
  pairSymbol: "SOL",
  // Creator fee on every trade.
  feePct: 3,
  // Price used to turn fees into Big Macs (USD).
  bigMacUsd: 5.79,
};
