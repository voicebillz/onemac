// Live Big Mac counter. Reads the fee wallet's history from a free Solana RPC,
// values every transaction's net inflow at today's Jupiter price and divides by
// the Big Mac price. Vercel's CDN caches the answer for 5 minutes.
import { CONFIG } from "../config.js";

const RPCS = [
  process.env.RPC_URL, // optional: a free Helius/QuickNode key avoids public rate limits
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_TX = Number(process.env.MAX_TX || 1500);
const CONCURRENCY = 6;
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function signatures(wallet) {
  const out = [];
  let before;
  while (out.length < MAX_TX) {
    const page = await rpc("getSignaturesForAddress", [wallet, { limit: 1000, before }]);
    if (!page.length) break;
    for (const s of page) if (!s.err) out.push(s.signature);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  return { sigs: out.slice(0, MAX_TX), partial: out.length > MAX_TX };
}

// Net change per mint for the wallet in one transaction (SOL counted as SOL_MINT).
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

async function prices(mints) {
  const out = {};
  const list = [...mints];
  for (let i = 0; i < list.length; i += 50) {
    const ids = list.slice(i, i + 50).join(",");
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`);
    if (!res.ok) continue;
    const json = await res.json();
    for (const [mint, v] of Object.entries(json)) out[mint] = Number(v?.usdPrice) || 0;
  }
  return out;
}

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
// pump.fun bonding curve, PumpSwap and pump fee-sharing programs: creator fees are paid out by these.
const FEE_PROGRAMS = [PUMP_PROGRAM, "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"];
const fromPump = (tx) => (tx.meta.logMessages || []).some((l) => FEE_PROGRAMS.some((id) => l.startsWith(`Program ${id} invoke`)));

async function transactions(wallet) {
  const { sigs, partial } = await signatures(wallet);
  const txs = [];
  for (let i = 0; i < sigs.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      sigs.slice(i, i + CONCURRENCY).map((s) =>
        rpc("getTransaction", [s, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null),
      ),
    );
    for (const tx of batch) if (tx?.meta && !tx.meta.err) txs.push(tx);
  }
  return { txs, partial };
}

// The newest pump.fun create transaction signed by the creator gives the coin's mint.
function findMint(txs, creator) {
  for (const tx of txs) {
    const logs = tx.meta.logMessages || [];
    if (!logs.some((l) => l.includes(PUMP_PROGRAM)) || !logs.some((l) => /Instruction: Create/.test(l))) continue;
    const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey;
    if (signer !== creator) continue;
    const pre = new Set((tx.meta.preTokenBalances || []).map((b) => b.mint));
    const fresh = (tx.meta.postTokenBalances || []).map((b) => b.mint).filter((m) => !pre.has(m));
    const mint = fresh.find((m) => m.endsWith("pump")) || fresh[0];
    if (mint) return mint;
  }
  return "";
}

// Creator fees not yet claimed: SOL in the bonding-curve vault (above its rent reserve)
// plus wrapped SOL in the PumpSwap vault.
const RENT_EXEMPT_EMPTY = 890880;
async function unclaimed() {
  const { curve, pumpswap } = CONFIG.creatorVaults || {};
  const keys = [curve, pumpswap].filter((a) => a && ADDR.test(a));
  if (!keys.length) return 0;
  const { value } = await rpc("getMultipleAccounts", [keys, { encoding: "jsonParsed" }]);
  let sol = 0;
  keys.forEach((k, i) => {
    const acc = value[i];
    if (!acc) return;
    if (k === curve) sol += Math.max(0, acc.lamports - RENT_EXEMPT_EMPTY) / 1e9;
    else sol += Number(acc.data?.parsed?.info?.tokenAmount?.uiAmountString || 0);
  });
  return sol;
}

export default async function handler(req, res) {
  const creator = process.env.CREATOR_WALLET || CONFIG.creatorWallet;
  const wallet = process.env.FEE_WALLET || CONFIG.feeWallet || creator;
  const base = { feePct: CONFIG.feePct, bigMacUsd: CONFIG.bigMacUsd, mint: CONFIG.tokenMint };
  if (!wallet || !ADDR.test(wallet)) {
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json({ ...base, live: false });
  }
  try {
    const { txs, partial } = await transactions(wallet);
    let mint = CONFIG.tokenMint;
    if (!mint && creator && ADDR.test(creator)) {
      mint = findMint(creator === wallet ? txs : (await transactions(creator)).txs, creator);
    }
    // Only pump.fun fee payouts count: plain deposits into the wallet are not fees.
    const perTx = txs.filter(fromPump).map((tx) => deltas(tx, wallet));
    const px = await prices(new Set([SOL_MINT]));
    const unclaimedSol = await unclaimed();
    // A pump.fun transaction that leaves the wallet richer is a fee claim (paid in the
    // paired MCD token). Any transaction that moves $ONEMAC itself is a trade, never a fee.
    let feesUsd = 0;
    let inflows = 0;
    for (const d of perTx) {
      // Creator fees are paid in SOL; anything that moves another token is a trade.
      if (Object.keys(d).some((m) => m !== SOL_MINT)) continue;
      const net = Object.entries(d).reduce((s, [m, amt]) => s + amt * (px[m] || 0), 0);
      if (net > 0) {
        feesUsd += net;
        inflows++;
      }
    }
    feesUsd += unclaimedSol * (px[SOL_MINT] || 0);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({
      ...base,
      mint,
      live: true,
      wallet,
      feesUsd: Math.floor(feesUsd * 100) / 100,
      bigMacs: Math.floor(feesUsd / CONFIG.bigMacUsd),
      inflows,
      claimedUsd: Math.floor((feesUsd - unclaimedSol * (px[SOL_MINT] || 0)) * 100) / 100,
      unclaimedSol: Math.floor(unclaimedSol * 1e4) / 1e4,
      partial,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(503).json({ ...base, live: false, error: "rpc_unavailable" });
  }
}
