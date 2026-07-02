import {
  allTxs, labels, pnlData, pnlManualEntries, pnlRemovedAuto,
  tokenDecimals, userDecimalOverrides,
  activeFilterUnit, activeFilterAddr, activeFilterWindow, activeAddrFilterWindow,
  setActiveFilterWindow, setActiveAddrFilterWindow,
  setCurrentPage, COLLAPSE_THRESHOLD,
  labelPopupAddr, labelPopupColor,
} from './state.js';
import { togglePanel, expandAllPnl } from './utils.js';
import { buildPnlData } from './calc.js';
import {
  filterTxLogByToken, clearTxFilter, filterTxLogByAddr, clearAddrFilter,
  togglePnlTarget, updateContextToggleBtn,
} from './filters.js';
import { togglePnlMembership, removeTxFromPnl, togglePnlToken } from './pnl.js';
import { openLabelPopup, closeLabelPopup, renderLabelsPanel, renderLabelsSummary, promptSetDecimals } from './labels.js';
import {
  renderTable, renderTimeline, renderSummaryTable, renderTokenPnl,
  renderPagination, goPage, jumpToPage, scrollToTx,
} from './render.js';
import { fetchAccount, importJSON, exportJSON, exportCSV, setFilterTxLogByAddrProxy, setDeleteLabelProxy } from './api.js';

// Helper: build the two callbacks renderLabelsPanel needs
function makeFilterAddr() { return addr => filterTxLogByAddr(addr, renderTable, renderTokenPnl); }
function makeDeleteLabel() {
  return addr => {
    labels.delete(addr);
    renderLabelsPanel(makeFilterAddr(), makeDeleteLabel());
    renderLabelsSummary();
    renderTable();
  };
}

// Give api.js references to the filter callback and delete callback
setFilterTxLogByAddrProxy(makeFilterAddr());
setDeleteLabelProxy(makeDeleteLabel());

// =================================================================
// STATIC BUTTON LISTENERS
// =================================================================
document.getElementById('search-btn').addEventListener('click', fetchAccount);
document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('label-popup-cancel').addEventListener('click', closeLabelPopup);
document.getElementById('pnl-expand-all').addEventListener('click', e => { e.stopPropagation(); expandAllPnl(true); });
document.getElementById('pnl-collapse-all').addEventListener('click', e => { e.stopPropagation(); expandAllPnl(false); });
document.getElementById('export-json-btn').addEventListener('click', exportJSON);
document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

document.getElementById('stake').addEventListener('keydown', e => { if (e.key==='Enter') fetchAccount(); });
document.addEventListener('keydown', e => { if (e.key==='Escape') closeLabelPopup(); });
window.addEventListener('resize', () => { if (allTxs.length) renderTimeline(); });

// File import
document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importJSON(file, addr => filterTxLogByAddr(addr, renderTable, renderTokenPnl));
  e.target.value = '';
});

// =================================================================
// TOKEN FILTER BANNER
// =================================================================
document.getElementById('tx-filter-clear-btn').addEventListener('click',
  () => clearTxFilter(renderTable, renderTokenPnl));

document.getElementById('tx-filter-window').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  setActiveFilterWindow(isNaN(v) ? 0 : Math.max(0, Math.min(50, v)));
  updateContextToggleBtn('tx-filter-context-toggle', activeFilterWindow);
  setCurrentPage(1);
  renderTable();
});

document.getElementById('tx-filter-context-toggle').addEventListener('click', () => {
  setActiveFilterWindow(activeFilterWindow===0 ? 3 : 0);
  document.getElementById('tx-filter-window').value = activeFilterWindow;
  updateContextToggleBtn('tx-filter-context-toggle', activeFilterWindow);
  setCurrentPage(1);
  renderTable();
});

// =================================================================
// ADDRESS FILTER BANNER
// =================================================================
document.getElementById('addr-filter-clear-btn').addEventListener('click',
  () => clearAddrFilter(renderTable, renderTokenPnl));

document.getElementById('addr-filter-window').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  setActiveAddrFilterWindow(isNaN(v) ? 0 : Math.max(0, Math.min(50, v)));
  updateContextToggleBtn('addr-filter-context-toggle', activeAddrFilterWindow);
  setCurrentPage(1);
  renderTable();
});

document.getElementById('addr-filter-context-toggle').addEventListener('click', () => {
  setActiveAddrFilterWindow(activeAddrFilterWindow===0 ? 3 : 0);
  document.getElementById('addr-filter-window').value = activeAddrFilterWindow;
  updateContextToggleBtn('addr-filter-context-toggle', activeAddrFilterWindow);
  setCurrentPage(1);
  renderTable();
});

// =================================================================
// LABEL POPUP
// =================================================================
document.getElementById('label-popup-save').addEventListener('click', () => {
  const name = document.getElementById('label-popup-input').value.trim();
  if (!name) { alert('Please enter a label.'); return; }
  labels.set(labelPopupAddr, { name, color: labelPopupColor });
  closeLabelPopup();
  renderTable();
  renderLabelsPanel(makeFilterAddr(), makeDeleteLabel());
  renderLabelsSummary();
});

document.getElementById('label-popup-remove').addEventListener('click', () => {
  labels.delete(labelPopupAddr);
  closeLabelPopup();
  renderTable();
  renderLabelsPanel(makeFilterAddr(), makeDeleteLabel());
  renderLabelsSummary();
});

document.getElementById('label-popup').addEventListener('click', e => {
  if (e.target === document.getElementById('label-popup')) closeLabelPopup();
});

// =================================================================
// PANEL TOGGLE HEADERS
// =================================================================
document.addEventListener('click', e => {
  const header = e.target.closest('[data-toggle-body]');
  if (header) togglePanel(header.dataset.toggleBody, header.dataset.toggleChev);
});

// =================================================================
// PAGINATION
// =================================================================
document.getElementById('pagination').addEventListener('click', e => {
  const btn = e.target.closest('[data-goto-page]');
  if (btn && !btn.disabled) goPage(parseInt(btn.dataset.gotoPage));
  const goBtn = e.target.closest('#page-jump-go');
  if (goBtn) jumpToPage(parseInt(goBtn.dataset.total));
});

document.getElementById('pagination').addEventListener('keydown', e => {
  if (e.key==='Enter' && e.target.id==='page-jump-input') jumpToPage(parseInt(e.target.dataset.total));
});

// =================================================================
// LABELS SUMMARY
// =================================================================
document.getElementById('labels-summary-wrap').addEventListener('click', e => {
  const btn = e.target.closest('[data-filter-addr]');
  if (btn) filterTxLogByAddr(btn.dataset.filterAddr, renderTable, renderTokenPnl);
});

// =================================================================
// TOKEN P&L LIST
// =================================================================
document.getElementById('token-pnl-list').addEventListener('click', e => {
  // Remove button and tx-link have their own listeners — bail out here
  if (e.target.closest('[data-remove-unit]')) return;
  if (e.target.closest('[data-hash]')) return;

  const targetBtn = e.target.closest('[data-target-pnl]');
  if (targetBtn) { e.stopPropagation(); togglePnlTarget(targetBtn.dataset.targetPnl, renderTokenPnl, renderTable); return; }

  const filterBtn = e.target.closest('[data-filter-token]');
  if (filterBtn) { e.stopPropagation(); filterTxLogByToken(filterBtn.dataset.filterToken, filterBtn.dataset.filterTokenName, renderTable, renderTokenPnl); return; }

  const header = e.target.closest('[data-toggle-pnl-token]');
  if (header) { togglePnlToken(header.dataset.togglePnlToken); }
});

// =================================================================
// TX BODY
// =================================================================
document.getElementById('tx-body').addEventListener('click', e => {
  const addBtn = e.target.closest('[data-pnl-add]');
  if (addBtn && !addBtn.disabled) {
    togglePnlMembership(addBtn.dataset.pnlAdd, renderTable, renderTokenPnl, renderSummaryTable);
    return;
  }

  const labelBtn = e.target.closest('.label-star-btn');
  if (labelBtn) { openLabelPopup(labelBtn.dataset.addr); return; }

  const addrEl = e.target.closest('[data-click-addr]');
  if (addrEl) {
    const addr = addrEl.dataset.clickAddr;
    // Auto-label if not already labeled
    if (!labels.has(addr)) {
      labels.set(addr, { name: addr.slice(-6), color: 'accent' });
      renderLabelsPanel(makeFilterAddr(), makeDeleteLabel());
      renderLabelsSummary();
      renderTable();
    }
    filterTxLogByAddr(addr, renderTable, renderTokenPnl);
    return;
  }

  const decimalsBtn = e.target.closest('[data-set-decimals]');
  if (decimalsBtn) {
    promptSetDecimals(
      decimalsBtn.dataset.setDecimals,
      decimalsBtn.dataset.tokenName,
      () => buildPnlData(allTxs, pnlData),
      renderTable, renderTimeline, renderSummaryTable, renderTokenPnl, renderLabelsSummary
    );
    return;
  }

  const expandBtn = e.target.closest('.utxo-expand-btn');
  if (expandBtn) {
    const expanded = expandBtn.dataset.expanded==='true';
    const tx = allTxs.find(t=>t.hash===expandBtn.dataset.hash); if (!tx) return;
    const count = expandBtn.dataset.side==='inputs' ? tx.inputs.length : tx.outputs.length;
    expandBtn.closest('.utxo-list').querySelectorAll('.utxo-entry').forEach((el,i)=>{
      if (i>=COLLAPSE_THRESHOLD) el.classList.toggle('hidden', expanded);
    });
    expandBtn.dataset.expanded = !expanded;
    expandBtn.textContent = expanded ? `Show ${count-COLLAPSE_THRESHOLD} more ▾` : 'Show less ▴';
  }
});
