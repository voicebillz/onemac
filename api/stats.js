// Live Big Mac counter + treasury. Reads Solana through a free RPC and prices with Jupiter.
// Creator rewards for $ONEMAC = SOL claimed to the creator wallet since launch
// + SOL still waiting in the creator's pump.fun vaults (minus what was there before launch).
// Vercel's CDN caches the answer for 5 minutes.
import { CONFIG } from "../config.js";

const RPCS = [
  process.env.RPC_URL, // optional: a free Helius/QuickNode key avoids public rate limits
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const SOL_MINT = "So11111111111111111111111111111111111111112";
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
// pump.fun bonding curve, PumpSwap and pump fee-sharing programs pay out creator rewards.
const FEE_PROGRAMS = [PUMP_PROGRAM, "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"];
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const MAX_TX = Number(process.env.MAX_TX || 1500);
const CONCURRENCY = 6;
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const floor2 = (n) => Math.floor(n * 100) / 100;

async function rpc(method, params) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = RPCS[attempt % RPCS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`rpc ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    } catch (e) {
      lastErr = e;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr;
}

// Successful signatures for an address, newest first, back to `since` (unix seconds).
async function signatures(address, since = 0, limit = MAX_TX) {
  const out = [];
  let before;
  while (out.length < limit) {
    const page = await rpc("getSignaturesForAddress", [address, { limit: 1000, before }]);
    if (!page.length) break;
    for (const s of page) {
      if (s.blockTime && s.blockTime < since) return { sigs: out, partial: false };
      if (!s.err) out.push(s.signature);
    }
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  return { sigs: out.slice(0, limit), partial: out.length > limit };
}

async function transactions(sigs) {
  const txs = [];
  for (let i = 0; i < sigs.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      sigs.slice(i, i + CONCURRENCY).map((s) =>
        rpc("getTransaction", [s, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null),
      ),
    );
    for (const tx of batch) if (tx?.meta && !tx.meta.err) txs.push(tx);
  }
  return txs;
}

// Net change per mint for the wallet in one transaction (SOL and wrapped SOL both as SOL_MINT).
function deltas(tx, wallet) {
  const d = {};
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const i = keys.indexOf(wallet);
  if (i >= 0) {
    const lamports = tx.meta.postBalances[i] - tx.meta.preBalances[i];
    if (lamports) d[SOL_MINT] = lamports / 1e9;
  }
  const add = (b, sign) => {
    if (b.owner !== wallet) return;
    d[b.mint] = (d[b.mint] || 0) + sign * Number(b.uiTokenAmount.uiAmountString || 0);
  };
  (tx.meta.preTokenBalances || []).forEach((b) => add(b, -1));
  (tx.meta.postTokenBalances || []).forEach((b) => add(b, 1));
  return d;
}

const fromPump = (tx) => (tx.meta.logMessages || []).some((l) => FEE_PROGRAMS.some((id) => l.startsWith(`Program ${id} invoke`)));

async function prices(mints) {
  const out = {};
  const list = [...mints];
  for (let i = 0; i < list.length; i += 50) {
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${list.slice(i, i + 50).join(",")}`);
    if (!res.ok) continue;
    const json = await res.json();
    for (const [mint, v] of Object.entries(json)) out[mint] = { usd: Number(v?.usdPrice) || 0 };
  }
  return out;
}

// Creator rewards still in the vaults: bonding-curve vault (SOL above its pre-launch
// balance) + PumpSwap vault (wrapped SOL, after graduation).
async function unclaimedSol() {
  const { curve, curveBaselineLamports = 0, pumpswap } = CONFIG.creatorVaults || {};
  const keys = [curve, pumpswap].filter((a) => a && ADDR.test(a));
  if (!keys.length) return 0;
  const { value } = await rpc("getMultipleAccounts", [keys, { encoding: "jsonParsed" }]);
  return keys.reduce((sol, k, i) => {
    const acc = value[i];
    if (!acc) return sol;
    if (k === curve) return sol + Math.max(0, acc.lamports - curveBaselineLamports) / 1e9;
    return sol + Number(acc.data?.parsed?.info?.tokenAmount?.uiAmountString || 0);
  }, 0);
}

// Current creator reward rate (basis points) from the newest pump.fun TradeEvent of the coin.
async function creatorFeeBps(mint) {
  const { sigs } = await signatures(mint, 0, 5);
  for (const s of sigs) {
    const tx = await rpc("getTransaction", [s, { encoding: "json", maxSupportedTransactionVersion: 0 }]).catch(() => null);
    for (const line of tx?.meta?.logMessages || []) {
      if (!line.startsWith("Program data: ")) continue;
      const b = Buffer.from(line.slice(14), "base64");
      // TradeEvent: disc(8) mint(32) sol(8) token(8) is_buy(1) user(32) ts(8) 4×reserves(32)
      // fee_recipient(32) fee_bps(8) fee(8) creator(32) creator_fee_bps(8) creator_fee(8) …
      if (b.length < 8 + 32 + 17 + 32 + 8 + 32 + 32 + 16 + 32 + 16) continue;
      const off = 8 + 32 + 17 + 32 + 8 + 32 + 32 + 16 + 32;
      const bps = Number(b.readBigUInt64LE(off));
      if (bps > 0 && bps < 1000) return bps;
    }
  }
  return null;
}

// Every SOL and token balance in the treasury wallet, valued with Jupiter.
async function treasury(wallet) {
  const [lamports, ...lists] = await Promise.all([
    rpc("getBalance", [wallet]),
    ...TOKEN_PROGRAMS.map((programId) => rpc("getTokenAccountsByOwner", [wallet, { programId }, { encoding: "jsonParsed" }])),
  ]);
  const amounts = { [SOL_MINT]: lamports.value / 1e9 };
  for (const list of lists) {
    for (const { account } of list.value) {
      const info = account.data.parsed.info;
      const amt = Number(info.tokenAmount.uiAmountString || 0);
      if (amt > 0) amounts[info.mint] = (amounts[info.mint] || 0) + amt;
    }
  }
  return amounts;
}

async function tokenSymbols(mints) {
  const out = {};
  await Promise.all(
    mints.map(async (m) => {
      if (m === SOL_MINT) return (out[m] = "SOL");
      if (m === CONFIG.tokenMint) return (out[m] = "ONEMAC");
      try {
        const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${m}`);
        const [t] = await res.json();
        out[m] = t?.symbol || `${m.slice(0, 4)}…`;
      } catch {
        out[m] = `${m.slice(0, 4)}…`;
      }
    }),
  );
  return out;
}

export default async function handler(req, res) {
  const creator = CONFIG.creatorWallet;
  const treasuryWallet = CONFIG.treasuryWallet || creator;
  const base = { bigMacUsd: CONFIG.bigMacUsd, mint: CONFIG.tokenMint };
  if (!ADDR.test(creator || "") || !ADDR.test(CONFIG.tokenMint || "")) {
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json({ ...base, live: false });
  }
  try {
    const since = Math.floor(Date.parse(CONFIG.launchedAt || 0) / 1000) || 0;
    const [{ sigs, partial }, vaultSol, bps, holdings] = await Promise.all([
      signatures(creator, since),
      unclaimedSol(),
      creatorFeeBps(CONFIG.tokenMint).catch(() => null),
      treasury(treasuryWallet),
    ]);
    const txs = await transactions(sigs);

    // A pump.fun payout that only adds SOL to the creator wallet is a claim of creator
    // rewards. Anything that also moves a token ($ONEMAC or others) is a trade, not a reward.
    let claimedSol = 0;
    let claims = 0;
    for (const tx of txs.filter(fromPump)) {
      const d = deltas(tx, creator);
      if (Object.keys(d).some((m) => m !== SOL_MINT)) continue;
      if ((d[SOL_MINT] || 0) > 0) {
        claimedSol += d[SOL_MINT];
        claims++;
      }
    }

    const px = await prices(new Set([SOL_MINT, ...Object.keys(holdings)]));
    const solUsd = px[SOL_MINT]?.usd || 0;
    const rewardsSol = claimedSol + vaultSol;
    const rewardsUsd = rewardsSol * solUsd;

    const symbols = await tokenSymbols(Object.keys(holdings));
    const assets = Object.entries(holdings)
      .map(([mint, amount]) => ({ mint, symbol: symbols[mint], amount, usd: amount * (px[mint]?.usd || 0) }))
      .filter((a) => a.usd >= 0.01 || a.mint === SOL_MINT)
      .sort((a, b) => b.usd - a.usd)
      .map((a) => ({ ...a, usd: floor2(a.usd) }));
    const treasuryUsd = assets.reduce((s, a) => s + a.usd, 0);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({
      ...base,
      live: true,
      wallet: creator,
      creatorFeeBps: bps,
      rewardsSol: Math.floor(rewardsSol * 1e4) / 1e4,
      unclaimedSol: Math.floor(vaultSol * 1e4) / 1e4,
      claims,
      feesUsd: floor2(rewardsUsd),
      bigMacs: Math.floor(rewardsUsd / CONFIG.bigMacUsd),
      treasury: {
        wallet: treasuryWallet,
        usd: floor2(treasuryUsd),
        bigMacs: Math.floor(treasuryUsd / CONFIG.bigMacUsd),
        assets,
      },
      partial,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(503).json({ ...base, live: false, error: "rpc_unavailable" });
  }
}
