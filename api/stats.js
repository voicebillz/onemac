// Live Big Mac counter + treasury. Reads Solana through a free RPC and prices with Jupiter.
// Creator rewards for $ONEMAC = the creator_fee pump.fun records in every trade of this coin,
// so rewards from the creator's other coins (which share the same vault) never count.
// Vercel's CDN caches the answer for 5 minutes.
import { createHash } from "node:crypto";
import { CONFIG } from "../config.js";

const RPCS = [
  process.env.RPC_URL, // optional: a free Helius/QuickNode key avoids public rate limits
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
// History and index lookups: publicnode prunes old transactions (returns empty/null)
// and refuses token indexes, so these go to the other RPCs.
const INDEXED = new Set(["getSignaturesForAddress", "getTransaction", "getTokenAccountsByOwner"]);
const INDEXED_RPCS = RPCS.filter((u) => !u.includes("publicnode"));

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const MAX_TX = Number(process.env.MAX_TX || 1500);
const CONCURRENCY = 6;
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const floor2 = (n) => Math.floor(n * 100) / 100;

async function rpc(method, params) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const pool = INDEXED.has(method) ? INDEXED_RPCS : RPCS;
    const url = pool[attempt % pool.length];
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

// pump.fun TradeEvent: disc(8) mint(32) sol(8) token(8) is_buy(1) user(32) ts(8) 4×reserves(32)
// fee_recipient(32) fee_bps(8) fee(8) creator(32) creator_fee_bps(8) creator_fee(8) …
const TRADE_DISC = createHash("sha256").update("event:TradeEvent").digest().subarray(0, 8);
const CREATOR_FEE_BPS_AT = 8 + 32 + 17 + 32 + 8 + 32 + 32 + 16 + 32;

function tradeEvents(tx, mintBytes) {
  const out = [];
  for (const line of tx.meta.logMessages || []) {
    if (!line.startsWith("Program data: ")) continue;
    const b = Buffer.from(line.slice(14), "base64");
    if (b.length < CREATOR_FEE_BPS_AT + 16 || !b.subarray(0, 8).equals(TRADE_DISC)) continue;
    if (!b.subarray(8, 40).equals(mintBytes)) continue;
    out.push({
      creatorFeeBps: Number(b.readBigUInt64LE(CREATOR_FEE_BPS_AT)),
      creatorFeeLamports: Number(b.readBigUInt64LE(CREATOR_FEE_BPS_AT + 8)),
    });
  }
  return out;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s) {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const hex = n.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
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
  const mint = CONFIG.tokenMint;
  const treasuryWallet = CONFIG.treasuryWallet || CONFIG.creatorWallet;
  const base = { bigMacUsd: CONFIG.bigMacUsd, mint };
  if (!ADDR.test(mint || "") || !ADDR.test(treasuryWallet || "")) {
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json({ ...base, live: false });
  }
  try {
    const [{ sigs, partial }, holdings] = await Promise.all([signatures(mint), treasury(treasuryWallet)]);
    const txs = await transactions(sigs); // newest first
    const mintBytes = base58Decode(mint);
    let lamports = 0;
    let trades = 0;
    let bps = null;
    for (const tx of txs) {
      for (const ev of tradeEvents(tx, mintBytes)) {
        lamports += ev.creatorFeeLamports;
        trades++;
        if (bps === null) bps = ev.creatorFeeBps;
      }
    }

    const px = await prices(new Set([SOL_MINT, ...Object.keys(holdings)]));
    const solUsd = px[SOL_MINT]?.usd || 0;
    const rewardsSol = lamports / 1e9;
    const rewardsUsd = rewardsSol * solUsd;

    const symbols = await tokenSymbols(Object.keys(holdings));
    const assets = Object.entries(holdings)
      .map(([m, amount]) => ({ mint: m, symbol: symbols[m], amount, usd: amount * (px[m]?.usd || 0) }))
      .filter((a) => a.usd >= 0.01 || a.mint === SOL_MINT)
      .sort((a, b) => b.usd - a.usd)
      .map((a) => ({ ...a, usd: floor2(a.usd) }));
    const treasuryUsd = assets.reduce((sum, a) => sum + a.usd, 0);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({
      ...base,
      live: true,
      wallet: CONFIG.creatorWallet,
      creatorFeeBps: bps,
      rewardsSol: Math.floor(rewardsSol * 1e6) / 1e6,
      trades,
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
