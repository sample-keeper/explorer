import {
  pnlData, pnlManualEntries, pnlRemovedAuto,
  activeFilterUnit, pnlTargetUnit,
  allTxs, getCurrentPage, setCurrentPage, PAGE_SIZE,
} from './state.js';
import { fmt, fmt4sig, formatAssetName, escHtml } from './utils.js';
import { calcTxNet } from './calc.js';

// True if this hash currently appears in unit's merged P&L entries
export function isInTokenPnl(unit, hash) {
  if (pnlManualEntries.get(unit)?.has(hash)) return true;
  const isAutoAnchor = (pnlData.get(unit)||[]).some(e => e.hash === hash);
  const isRemoved    = pnlRemovedAuto.get(unit)?.has(hash);
  return isAutoAnchor && !isRemoved;
}

// Return every token unit this transaction currently belongs to in the P&L
export function getTokensForTx(hash) {
  const units = new Set([...pnlData.keys(), ...pnlManualEntries.keys()]);
  return [...units].filter(unit => isInTokenPnl(unit, hash));
}

// Merge auto-detected entries (minus removed) with manually-added entries
export function getMergedEntries(unit) {
  const removed = pnlRemovedAuto.get(unit) || new Set();
  const auto = new Map(
    (pnlData.get(unit)||[])
      .filter(e => !removed.has(e.hash))
      .map(e => [e.hash, e])
  );
  (pnlManualEntries.get(unit)||new Map()).forEach((e, hash) => auto.set(hash, e));
  return [...auto.values()].sort((a,b) => b.time - a.time); // newest first
}

// All known units with at least one entry after merging
export function allPnlUnits() {
  const units = new Set([...pnlData.keys(), ...pnlManualEntries.keys()]);
  return new Set([...units].filter(u => getMergedEntries(u).length > 0));
}

// Toggle a tx in/out of the active filtered token's P&L
export function togglePnlMembership(hash, renderTable, renderTokenPnl, renderSummaryTable) {
  const unit = activeFilterUnit || pnlTargetUnit;
  if (!unit) return;
  const tx = allTxs.find(t => t.hash === hash);
  if (!tx) return;

  if (isInTokenPnl(unit, hash)) {
    pnlManualEntries.get(unit)?.delete(hash);
    if (!pnlRemovedAuto.has(unit)) pnlRemovedAuto.set(unit, new Set());
    pnlRemovedAuto.get(unit).add(hash);
  } else {
    pnlRemovedAuto.get(unit)?.delete(hash);
    const { adaNet, tokenNet } = calcTxNet(tx);
    const date = new Date(tx.time*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const tNet = tokenNet.get(unit) || 0;
    if (!pnlManualEntries.has(unit)) pnlManualEntries.set(unit, new Map());
    pnlManualEntries.get(unit).set(hash, { hash, date, time:tx.time, tokenNet:tNet, adaNet });
  }

  renderTable();
  renderTokenPnl();
  renderSummaryTable();
}

// Remove any entry from a token's P&L (auto-detected or manual)
export function removeTxFromPnl(unit, hash, renderTokenPnl, renderSummaryTable, renderTable) {
  pnlManualEntries.get(unit)?.delete(hash);
  if (!pnlRemovedAuto.has(unit)) pnlRemovedAuto.set(unit, new Set());
  pnlRemovedAuto.get(unit).add(hash);
  renderTokenPnl();
  renderSummaryTable();
  renderTable();
}

export function pnlSummaryHTML(unit, entries) {
  let adaPaid=0, adaRec=0, tkBought=0, tkSold=0;
  entries.forEach(e => {
    if (e.adaNet < 0) adaPaid += Math.abs(e.adaNet);
    if (e.adaNet > 0) adaRec  += e.adaNet;
    if (e.tokenNet > 0) tkBought += e.tokenNet;
    if (e.tokenNet < 0) tkSold   += Math.abs(e.tokenNet);
  });
  const gain=adaRec-adaPaid, gc=gain>=0?'var(--accent)':'var(--red)';
  const avgBuy=tkBought>0?adaPaid/tkBought:null, avgSell=tkSold>0?adaRec/tkSold:null;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:11px;">
    <div><span style="color:var(--muted);">ADA paid</span> <span style="font-family:var(--mono);color:var(--red);">${fmt4sig(adaPaid)} ₳</span>${avgBuy!==null?`<span style="color:var(--muted);font-size:10px;"> (${fmt4sig(avgBuy)} ₳/tkn)</span>`:''}</div>
    <div><span style="color:var(--muted);">ADA received</span> <span style="font-family:var(--mono);color:var(--accent);">${fmt4sig(adaRec)} ₳</span>${avgSell!==null?`<span style="color:var(--muted);font-size:10px;"> (${fmt4sig(avgSell)} ₳/tkn)</span>`:''}</div>
    <div><span style="color:var(--muted);">Tokens bought</span> <span style="font-family:var(--mono);color:var(--accent);">${fmt4sig(tkBought)}</span></div>
    <div><span style="color:var(--muted);">Tokens sold</span> <span style="font-family:var(--mono);color:var(--red);">${fmt4sig(tkSold)}</span></div>
  </div>
  <div style="margin-top:6px;font-size:12px;font-weight:600;font-family:var(--mono);color:${gc};">Net gain: ${gain>=0?'+':''}${fmt4sig(gain)} ₳</div>`;
}

export function renderPnlTotals() {
  const el = document.getElementById('token-pnl-totals');
  let paid=0, rec=0;
  allPnlUnits().forEach(unit => getMergedEntries(unit).forEach(e => {
    if (e.adaNet < 0) paid += Math.abs(e.adaNet);
    if (e.adaNet > 0) rec  += e.adaNet;
  }));
  if (paid===0 && rec===0) { el.style.display='none'; return; }
  const gain=rec-paid, gc=gain>=0?'var(--accent)':'var(--red)';
  el.style.display='block';
  el.innerHTML=`<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Overall Token P&L</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;margin-bottom:4px;">
      <span><span style="color:var(--muted);">Total ADA paid</span> <span style="font-family:var(--mono);color:var(--red);">${fmt4sig(paid)} ₳</span></span>
      <span><span style="color:var(--muted);">Total ADA received</span> <span style="font-family:var(--mono);color:var(--accent);">${fmt4sig(rec)} ₳</span></span>
    </div>
    <div style="font-size:13px;font-weight:600;font-family:var(--mono);color:${gc};">Net: ${gain>=0?'+':''}${fmt4sig(gain)} ₳</div>`;
}

export function togglePnlToken(unit) {
  document.getElementById(`pnl-body-${unit}`)?.classList.toggle('open');
}
