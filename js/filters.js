import {
  allTxs, pnlData, pnlManualEntries, pnlRemovedAuto,
  labels,
  activeFilterUnit, setActiveFilterUnit, lastFilterUnit, setLastFilterUnit,
  activeFilterAddr, setActiveFilterAddr, lastFilterAddr, setLastFilterAddr,
  activeFilterWindow, setActiveFilterWindow,
  activeAddrFilterWindow, setActiveAddrFilterWindow,
  pnlTargetUnit, setPnlTargetUnit,
  setCurrentPage, getCurrentPage,
} from './state.js';
import { calcTxNet } from './calc.js';
import { formatAssetName } from './utils.js';

// =================================================================
// TOKEN FILTER
// =================================================================
export function filterTxLogByToken(unit, name, renderTable, renderTokenPnl) {
  const changed = lastFilterUnit !== unit;
  setActiveFilterUnit(unit);
  setLastFilterUnit(unit);
  setActiveFilterAddr(null);
  setPnlTargetUnit(null);
  document.getElementById('addr-filter-banner').style.display = 'none';
  if (changed) setCurrentPage(1);
  document.getElementById('tx-filter-banner').style.display = 'flex';
  document.getElementById('tx-filter-token-name').textContent = name;
  document.getElementById('tx-filter-window').value = activeFilterWindow;
  renderTable();
  renderTokenPnl();
}

export function clearTxFilter(renderTable, renderTokenPnl) {
  setActiveFilterUnit(null);
  document.getElementById('tx-filter-banner').style.display = 'none';
  renderTable();
  renderTokenPnl();
}

export function getFilteredTxList(unit, windowSize) {
  const chrono = [...allTxs].reverse();
  const hashToIdx = new Map(chrono.map((tx, i) => [tx.hash, i]));
  const anchorIndices = new Set();

  chrono.forEach((tx, i) => {
    const { tokenNet } = calcTxNet(tx);
    if (tokenNet.has(unit)) anchorIndices.add(i);
  });

  const removed = pnlRemovedAuto.get(unit) || new Set();
  (pnlManualEntries.get(unit) || new Map()).forEach((_, hash) => {
    if (!removed.has(hash)) {
      const idx = hashToIdx.get(hash);
      if (idx !== undefined) anchorIndices.add(idx);
    }
  });

  const includedIndices = new Set();
  anchorIndices.forEach(i => {
    const start = Math.max(0, i - windowSize);
    const end   = Math.min(chrono.length-1, i + windowSize);
    for (let j = start; j <= end; j++) includedIndices.add(j);
  });

  return [...includedIndices].sort((a,b)=>a-b).map(i => ({ tx:chrono[i], isAnchor:anchorIndices.has(i) }));
}

// =================================================================
// ADDRESS FILTER
// =================================================================
export function filterTxLogByAddr(addr, renderTable, renderTokenPnl) {
  const changed = lastFilterAddr !== addr;
  setActiveFilterAddr(addr);
  setLastFilterAddr(addr);
  setActiveFilterUnit(null);
  document.getElementById('tx-filter-banner').style.display = 'none';
  if (changed) setCurrentPage(1);
  document.getElementById('addr-filter-banner').style.display = 'flex';
  document.getElementById('addr-filter-window').value = activeAddrFilterWindow;
  updateContextToggleBtn('addr-filter-context-toggle', activeAddrFilterWindow);
  const label = labels.get(addr);
  document.getElementById('addr-filter-name').textContent = label
    ? `${label.name} (${addr.slice(0,8)}…${addr.slice(-6)})`
    : addr;
  renderTable();
  renderTokenPnl();
}

export function clearAddrFilter(renderTable, renderTokenPnl) {
  setActiveFilterAddr(null);
  setPnlTargetUnit(null);
  updatePnlTargetBanner();
  document.getElementById('addr-filter-banner').style.display = 'none';
  renderTable();
  renderTokenPnl();
}

export function getFilteredTxListByAddr(addr) {
  const chrono = [...allTxs].reverse();
  const anchorIndices = new Set();
  chrono.forEach((tx, i) => {
    const touched = (tx.inputs||[]).some(u=>u.address===addr)
                 || (tx.outputs||[]).some(u=>u.address===addr);
    if (touched) anchorIndices.add(i);
  });
  const w = activeAddrFilterWindow;
  const includedIndices = new Set();
  anchorIndices.forEach(i => {
    const start = Math.max(0, i-w);
    const end   = Math.min(chrono.length-1, i+w);
    for (let j=start; j<=end; j++) includedIndices.add(j);
  });
  return [...includedIndices].sort((a,b)=>a-b).map(i => ({ tx:chrono[i], isAnchor:anchorIndices.has(i) }));
}

// =================================================================
// P&L TARGET (⊕ button)
// =================================================================
export function togglePnlTarget(unit, renderTokenPnl, renderTable) {
  setPnlTargetUnit(pnlTargetUnit === unit ? null : unit);
  updatePnlTargetBanner();
  renderTokenPnl();
  renderTable();
}

export function updatePnlTargetBanner() {
  const el = document.getElementById('addr-filter-pnl-target');
  if (!el) return;
  // Import state values inline — these are live bindings in ES modules,
  // so they reflect the current value after any set* calls.
  if (pnlTargetUnit && activeFilterAddr) {
    const name = formatAssetName(pnlTargetUnit.slice(56)) || 'token';
    el.textContent = `· + adds to: ${name}`;
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

export function updateContextToggleBtn(id, windowSize) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const on = windowSize > 0;
  btn.textContent = `Context: ${on ? 'on' : 'off'}`;
  btn.style.color = on ? 'var(--accent)' : 'var(--muted)';
  btn.style.borderColor = on ? 'var(--accent)' : '';
}
