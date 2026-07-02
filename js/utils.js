import { tokenDecimals } from './state.js';

export function lovelace(l)   { return parseInt(l||0)/1_000_000; }
export function fmt(n, dec=2) { return n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }

export function fmt4sig(n) {
  if (n===0) return '0';
  const abs=Math.abs(n), sign=n<0?'-':'';
  for (const [div,sfx] of [[1e12,'t'],[1e9,'b'],[1e6,'m'],[1e3,'k']]) {
    if (abs>=div) return sign+parseFloat((abs/div).toPrecision(4))+sfx;
  }
  if (abs>=1) return sign+parseFloat(abs.toPrecision(4));
  // For fractions: show 4 sig figs, but switch to scientific notation
  // if the result would be more than 6 characters (too many leading zeros)
  const s = parseFloat(abs.toPrecision(4)).toString();
  if (s.length <= 6) return sign+s;
  return sign+parseFloat(abs.toPrecision(3)).toExponential(2).replace('e-0','e-').replace('e+','e');
}

export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function applyDecimals(qty, unit) {
  return parseInt(qty) / Math.pow(10, tokenDecimals.get(unit) ?? 6);
}

export function formatAssetName(hex) {
  try {
    const s = String.fromCharCode(...hex.match(/.{1,2}/g).map(b=>parseInt(b,16)));
    if (/^[\x20-\x7E]+$/.test(s)) return s;
  } catch {}
  return 'null';
}

export function setStatus(msg, isErr=false) {
  const el = document.getElementById('status');
  el.innerHTML = msg;
  el.className = isErr ? 'error' : '';
}

export function togglePanel(bodyId, chevId) {
  const b = document.getElementById(bodyId), c = document.getElementById(chevId);
  if (b) { b.classList.toggle('open'); if (c) c.classList.toggle('open', b.classList.contains('open')); }
}

export function expandAllPnl(open) {
  document.querySelectorAll('.pnl-token-body').forEach(el => el.classList.toggle('open', open));
}

export function showSkeleton(rows=8) {
  const ws = ['60%','40%','80%','55%','70%','45%','65%','50%'];
  document.getElementById('tx-body').innerHTML = Array.from({length:rows},(_,i)=>
    `<tr class="skeleton-row"><td><div class="skeleton-bar" style="width:80%"></div></td><td><div class="skeleton-bar" style="width:60%"></div></td><td><div class="skeleton-bar" style="width:${ws[i%ws.length]}"></div></td></tr>`
  ).join('');
}
