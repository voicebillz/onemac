import { CONFIG } from "/config.js";

const $ = (s) => document.querySelector(s);
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const int = (n) => Math.floor(n).toLocaleString("en-US");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Static settings into the copy
document.querySelectorAll("[data-pair]").forEach((el) => (el.textContent = CONFIG.pairSymbol));
document.querySelectorAll("[data-fee]").forEach((el) => (el.textContent = CONFIG.feePct));
document.querySelectorAll("[data-bigmac]").forEach((el) => (el.textContent = usd(CONFIG.bigMacUsd)));

// Buy + copy CA once the mint is set
if (CONFIG.tokenMint) {
  const buy = $("#buy");
  buy.textContent = "Buy $ONEMAC";
  buy.href = `https://jup.ag/swap/SOL-${CONFIG.tokenMint}`;
  buy.target = "_blank";
  buy.rel = "noopener";
  const copy = $("#copy-ca");
  copy.hidden = false;
  $("#ca-short").textContent = `${CONFIG.tokenMint.slice(0, 4)}…${CONFIG.tokenMint.slice(-4)}`;
  copy.setAttribute("aria-label", `Copy contract address ${CONFIG.tokenMint}`);
  copy.addEventListener("click", async () => {
    const label = copy.querySelector(".copy-label");
    try {
      await navigator.clipboard.writeText(CONFIG.tokenMint);
      label.textContent = "Copied";
    } catch {
      label.textContent = "Copy failed";
    }
    setTimeout(() => (label.textContent = "Copy CA"), 1600);
  });
}

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
    setStat("#price", usd(s.bigMacUsd ?? CONFIG.bigMacUsd));
    if (!s.live) {
      setStat("#macs", "0");
      setStat("#fees", usd(0));
      setStat("#inflows", "0");
      $("#counter-note").textContent =
        s.error ? "Solana RPC is busy. Retrying in a minute." : "The counter goes live at launch.";
      if (s.error) setTimeout(loadStats, 60_000);
      return;
    }
    countUp($("#macs"), s.bigMacs, int);
    countUp($("#fees"), s.feesUsd, usd);
    countUp($("#inflows"), s.inflows, int);
    const note = $("#counter-note");
    note.textContent = "Read live from the fee wallet on Solana. ";
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

// Calculator: slider is logarithmic from $10 to $1M
const amount = $("#amount");
const slider = $("#slider");
const MIN = 10;
const MAX = 1_000_000;
const toSlider = (v) => Math.round((Math.log10(Math.min(Math.max(v, MIN), MAX) / MIN) / Math.log10(MAX / MIN)) * 1000);
const fromSlider = (p) => {
  const raw = MIN * (MAX / MIN) ** (p / 1000);
  const step = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / step) * step;
};
const parse = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

function renderBurgers(n) {
  const box = $("#burgers");
  box.textContent = "";
  const shown = Math.min(n, 24);
  for (let i = 0; i < shown; i++) {
    const b = document.createElement("span");
    b.textContent = "🍔";
    b.style.animationDelay = `${i * 18}ms`;
    box.append(b);
  }
  if (n > shown) {
    const more = document.createElement("span");
    more.className = "more";
    more.textContent = `+${int(n - shown)}`;
    box.append(more);
  }
}

function calc(v) {
  const fee = Math.floor(v * CONFIG.feePct) / 100;
  const macs = Math.floor(fee / CONFIG.bigMacUsd);
  $("#calc-fee").textContent = usd(fee);
  $("#calc-macs").textContent = int(macs);
  renderBurgers(macs);
  document.querySelectorAll("[data-amt]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.amt) === v)));
}

amount.addEventListener("input", () => {
  const v = parse(amount.value);
  slider.value = toSlider(v);
  calc(v);
});
amount.addEventListener("blur", () => (amount.value = parse(amount.value).toLocaleString("en-US")));
slider.addEventListener("input", () => {
  const v = fromSlider(Number(slider.value));
  amount.value = v.toLocaleString("en-US");
  calc(v);
});
document.querySelectorAll("[data-amt]").forEach((b) =>
  b.addEventListener("click", () => {
    const v = Number(b.dataset.amt);
    amount.value = v.toLocaleString("en-US");
    slider.value = toSlider(v);
    calc(v);
  }),
);
slider.value = toSlider(1000);
calc(1000);
