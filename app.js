import { CONFIG } from "/config.js";

const $ = (s) => document.querySelector(s);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const int = (n) => Math.floor(n).toLocaleString("en-US");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Static settings into the copy
document.querySelectorAll("[data-pair]").forEach((el) => (el.textContent = CONFIG.pairSymbol));
document.querySelectorAll("[data-fee]").forEach((el) => (el.textContent = CONFIG.feePct));
document.querySelectorAll("[data-bigmac]").forEach((el) => (el.textContent = usd(CONFIG.bigMacUsd)));

// Contract address: from config, or found by /api/stats from the creator's launch.
let caSet = false;
function setMint(mint) {
  if (!mint || caSet) return;
  caSet = true;
  const btn = $("#copy-ca");
  btn.disabled = false;
  btn.setAttribute("aria-label", `Copy contract address ${mint}`);
  $("#ca-text").textContent = mint;
  $("#ca-copy").textContent = "Copy";
  $("#ca-hint").hidden = false;
  const buy = $("#buy");
  buy.href = `https://pump.fun/coin/${mint}`;
  buy.hidden = false;
  btn.addEventListener("click", async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(mint);
    } catch {
      ok = false;
    }
    btn.classList.toggle("copied", ok);
    $("#ca-copy").textContent = ok ? "Copied ✓" : "Copy failed";
    $("#ca-hint").textContent = ok ? "Copied to clipboard" : "Select and copy the address";
    setTimeout(() => {
      btn.classList.remove("copied");
      $("#ca-copy").textContent = "Copy";
      $("#ca-hint").textContent = "Click to copy";
    }, 1800);
  });
}
setMint(CONFIG.tokenMint);

// Live counter
function countUp(el, to, fmt) {
  el.removeAttribute("aria-busy");
  if (reduced || to < 2) return void (el.textContent = fmt(to));
  const t0 = performance.now();
  const dur = 1200;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(to * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setStat(id, text) {
  const el = $(id);
  el.removeAttribute("aria-busy");
  el.textContent = text;
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const s = await res.json();
    setMint(s.mint);
    setStat("#price", usd(s.bigMacUsd ?? CONFIG.bigMacUsd));
    if (!s.live) {
      setStat("#macs", "0");
      setStat("#fees", usd(0));
      setStat("#inflows", `0 ${s.feeSymbol || CONFIG.pairSymbol}`);
      $("#counter-note").textContent =
        s.error ? "Solana RPC is busy. Retrying in a minute." : "Counter is warming up. Check back in a minute.";
      if (s.error) setTimeout(loadStats, 60_000);
      return;
    }
    countUp($("#macs"), s.bigMacs, int);
    countUp($("#fees"), s.feesUsd, usd);
    setStat("#inflows", `${(s.unclaimed ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${s.feeSymbol || CONFIG.pairSymbol}`);
    const note = $("#counter-note");
    note.textContent = "Creator fees (claimed + waiting in the pump.fun vault), read live on Solana. ";
    const a = document.createElement("a");
    a.href = `https://solscan.io/account/${s.wallet}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "View wallet";
    note.append(a);
  } catch {
    $("#counter-note").textContent = "Could not reach the counter. Retrying in a minute.";
    setTimeout(loadStats, 60_000);
  }
}
loadStats();
setInterval(loadStats, 5 * 60_000);

// Calculator: the chart grows by itself over 30 example days, holds, then replays.
const amount = $("#amount");
const DAYS = 30;
const W = 600;
const H = 220;
const GROW_MS = 6000;
const HOLD_MS = 2500;
const parse = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const trim = (s) => s.replace(/\.0+$/, "");
const compact = (n) =>
  n >= 1e6 ? `$${trim((n / 1e6).toFixed(n >= 1e7 ? 1 : 2))}M` : n >= 1e4 ? `$${trim((n / 1e3).toFixed(1))}k` : usd(n);

// Fixed, gently rising daily pattern so every visitor sees the same example.
const weights = Array.from({ length: DAYS }, (_, i) => (0.45 + i / DAYS) * (0.7 + 0.6 * Math.abs(Math.sin(i * 12.9898) % 1)));
const wSum = weights.reduce((a, b) => a + b, 0);

let series = [];
function build(total) {
  let cum = 0;
  series = weights.map((w) => {
    const vol = (total * w) / wSum;
    cum += vol;
    return { vol, cum };
  });
  const maxVol = Math.max(...series.map((d) => d.vol));
  const step = W / DAYS;
  const bars = $("#bars");
  bars.textContent = "";
  series.forEach((d, i) => {
    const h = (d.vol / maxVol) * H * 0.55;
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", (i * step + step * 0.18).toFixed(2));
    r.setAttribute("width", (step * 0.64).toFixed(2));
    r.setAttribute("y", (H - h).toFixed(2));
    r.setAttribute("height", h.toFixed(2));
    r.setAttribute("rx", "1.5");
    bars.append(r);
  });
  const pts = [[0, H], ...series.map((d, i) => [(i + 1) * step, H - (d.cum / total) * (H - 12)])];
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  $("#line").setAttribute("d", line);
  $("#area").setAttribute("d", `${line}L${W},${H}L0,${H}Z`);
  return pts;
}

let pts = [];
let total = 0;
let t0 = 0;
let raf = 0;
let visible = false;

function draw(p) {
  // p: 0..1 progress through the 30 days
  const x = p * W;
  $("#reveal-rect").setAttribute("width", x.toFixed(2));
  const f = p * DAYS;
  const i = Math.min(DAYS - 1, Math.floor(f));
  const prev = i > 0 ? series[i - 1].cum : 0;
  const traded = p >= 1 ? total : prev + (series[i].cum - prev) * (f - i);
  const fee = Math.floor(traded * CONFIG.feePct) / 100;
  $("#r-traded").textContent = compact(traded);
  $("#r-fee").textContent = compact(fee);
  $("#r-macs").textContent = int(fee / CONFIG.bigMacUsd);
  $("#r-day").textContent = `Day ${Math.min(DAYS, Math.ceil(f))}`;
  // Burger rides the tip of the line
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  const k = p >= 1 ? 1 : f - i;
  const svg = $("#chart").getBoundingClientRect();
  const head = $("#head");
  head.style.left = `${((x0 + (x1 - x0) * k) / W) * svg.width}px`;
  head.style.top = `${((y0 + (y1 - y0) * k) / H) * svg.height}px`;
}

function frame(t) {
  const e = (t - t0) % (GROW_MS + HOLD_MS);
  const p = Math.min(1, e / GROW_MS);
  draw(1 - (1 - p) ** 2); // ease-out
  raf = requestAnimationFrame(frame);
}

function start(v) {
  total = Math.max(0, v);
  pts = build(total || 1);
  cancelAnimationFrame(raf);
  document.querySelectorAll("[data-amt]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.amt) === v)));
  if (reduced || !visible) return draw(1);
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
}

new IntersectionObserver(([e]) => {
  const was = visible;
  visible = e.isIntersecting;
  if (visible && !was) start(total);
  if (!visible) cancelAnimationFrame(raf);
}).observe($("#chart"));

amount.addEventListener("input", () => start(parse(amount.value)));
amount.addEventListener("blur", () => (amount.value = parse(amount.value).toLocaleString("en-US")));
document.querySelectorAll("[data-amt]").forEach((b) =>
  b.addEventListener("click", () => {
    const v = Number(b.dataset.amt);
    amount.value = v.toLocaleString("en-US");
    start(v);
  }),
);
addEventListener("resize", () => (reduced || !visible) && draw(1));
start(parse(amount.value));
