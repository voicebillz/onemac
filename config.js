// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
export const CONFIG = {
  // $ONEMAC ("One Big Mac") on pump.fun (contract address).
  tokenMint: "2xAZD72N2iXGvLJc1t3eA6cUAeJ2wjY6YB1SMzzrpump",
  // Paired with McDonald's xStock (MCDx); creator rewards are paid in it.
  pairSymbol: "MCD",
  quoteMint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
  quoteDecimals: 8,
  // Wallet that launched $ONEMAC and receives its creator rewards.
  creatorWallet: "1ooAUr8e789HTrXnUwWqY1aGUJGpZhes2nvufb1T9UY",
  // Treasury: everything this wallet holds is shown on the page.
  treasuryWallet: "1ooAUr8e789HTrXnUwWqY1aGUJGpZhes2nvufb1T9UY",
  // Price used to turn rewards into Big Macs (USD).
  bigMacUsd: 5.79,
};
