// $ONEMAC site settings. Shared by the page (/config.js) and the live counter (/api/stats).
export const CONFIG = {
  // $ONEMAC on pump.fun (contract address), paired with SOL.
  tokenMint: "ERChimxArJHLdJbWy1G2Tv7ztUL3MZ5SZg8JAukrpump",
  launchedAt: "2026-10-21T03:45:30Z",
  pairSymbol: "SOL",
  // Wallet that launched $ONEMAC; pump.fun pays the creator rewards to it when claimed.
  creatorWallet: "1ooAUr8e789HTrXnUwWqY1aGUJGpZhes2nvufb1T9UY",
  // Where unclaimed creator rewards wait (PDAs of creatorWallet): the pump.fun vault (SOL)
  // and the PumpSwap vault (wrapped SOL, after graduation). The baseline is what sat in the
  // pump.fun vault before this launch, so rewards from earlier coins are not counted.
  creatorVaults: {
    curve: "Ef7Dpn9igXKq1pfocNJoDupCPvynKEh2VbFDb9ttuVNC",
    curveBaselineLamports: 650240,
    pumpswap: "4XbNC22VgNN5431G4mojbeVkbxcD3Jvt3Z5EXjVUEeUp",
  },
  // Treasury: everything this wallet holds is shown on the page.
  treasuryWallet: "1ooAUr8e789HTrXnUwWqY1aGUJGpZhes2nvufb1T9UY",
  // Price used to turn rewards into Big Macs (USD).
  bigMacUsd: 5.79,
};
