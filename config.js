// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
export const CONFIG = {
  // $ONEMAC on pump.fun (contract address).
  tokenMint: "FkCM5CDrsqj6zbhVAS8ut4yr5Z1eBsFzakq4QmvQpump",
  // Wallet that launched $ONEMAC; pump.fun pays the creator fees to it when claimed.
  creatorWallet: "1ooAUr8e789HTrXnUwWqY1aGUJGpZhes2nvufb1T9UY",
  // Pair: McDonald's xStock (MCDx). Creator fees are paid in this token.
  pairSymbol: "MCD",
  feeMint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
  // Where unclaimed creator fees wait: the MCDx token accounts of the creator's
  // pump.fun vault (bonding curve) and PumpSwap vault (after graduation).
  creatorVaults: {
    curve: "4pmTpySRn7hQEXv18gDrTG4ez4woBN7ihJp5hD6P8jL3",
    pumpswap: "EqRbxAwbpBd84mFjt8qqTcPH9jz1k42cFiej85GYdM4z",
  },
  // Optional: a different wallet that receives the fees (defaults to creatorWallet).
  feeWallet: "",
  // Creator fee on every trade.
  feePct: 3,
  // Price used to turn fees into Big Macs (USD).
  bigMacUsd: 5.79,
};
