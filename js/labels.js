import {
  labels, LABEL_COLORS,
  labelPopupAddr, setLabelPopupAddr,
  labelPopupColor, setLabelPopupColor,
  tokenDecimals, userDecimalOverrides, allTxs,
} from './state.js';
import { fmt, fmt4sig, formatAssetName, escHtml } from './utils.js';
import { calcAddrFlow } from './calc.js';

// =================================================================
// LABEL POPUP
// =================================================================
export function openLabelPopup(addr) {
  setLabelPopupAddr(addr);
  const existing = labels.get(addr);
  setLabelPopupColor(existing?.color || 'accent');

  document.getElementById('label-popup-addr').textContent = addr;
  document.getElementById('label-popup-input').value = existing?.name || '';
  document.getElementById('label-popup-remove').style.display = existing ? 'inline-flex' : 'none';

  const colorsEl = document.getElementById('label-popup-colors');
  colorsEl.innerHTML = LABEL_COLORS.map(c =>
    `<button data-color="${c}" class="label-chip ${c}" style="cursor:pointer;border:2px solid ${c===labelPopupColor?'var(--text)':'transparent'};">●</button>`
  ).join('');
  colorsEl.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => {
    setLabelPopupColor(btn.dataset.color);
    colorsEl.querySelectorAll('[data-color]').forEach(b =>
      b.style.borderColor = b.dataset.color===labelPopupColor ? 'var(--text)' : 'transparent'
    );
  }));

  document.getElementById('label-popup').style.display = 'flex';
  document.getElementById('label-popup-input').focus();
}

export function closeLabelPopup() {
  document.getElementById('label-popup').style.display = 'none';
  setLabelPopupAddr(null);
}

// =================================================================
// LABELS PANEL (chip bar above tx log)
// =================================================================
export function renderLabelsPanel(filterTxLogByAddr, onDeleteLabel) {
  const panel = document.getElementById('labels-panel');
  const chips = document.getElementById('labels-panel-chips');
  if (!labels.size) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  chips.innerHTML = [...labels.entries()].map(([addr, l]) => `
    <span class="label-chip ${l.color}" style="cursor:pointer;padding-right:4px;" title="${escHtml(addr)}">
      <span data-filter-label="${escHtml(addr)}" style="cursor:pointer;">${escHtml(l.name)}</span>
      <button data-edit-label="${escHtml(addr)}" title="Edit label" style="background:none;border:none;color:inherit;cursor:pointer;font-size:9px;padding:0;opacity:0.7;">✎</button>
      <button data-delete-label="${escHtml(addr)}" title="Delete label" style="background:none;border:none;color:inherit;cursor:pointer;font-size:9px;padding:0;opacity:0.7;">✕</button>
    </span>
  `).join('');
  chips.querySelectorAll('[data-filter-label]').forEach(el =>
    el.addEventListener('click', () => filterTxLogByAddr(el.dataset.filterLabel))
  );
  chips.querySelectorAll('[data-edit-label]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openLabelPopup(btn.dataset.editLabel); })
  );
  chips.querySelectorAll('[data-delete-label]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (onDeleteLabel) onDeleteLabel(btn.dataset.deleteLabel);
    })
  );
}

// =================================================================
// LABELS SUMMARY PANEL
// =================================================================
export function renderLabelsSummary() {
  const panel = document.getElementById('labels-summary-panel');
  const wrap  = document.getElementById('labels-summary-wrap');
  if (!labels.size || !allTxs.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const rows = [...labels.entries()].map(([addr, l]) => {
    const f = calcAddrFlow(addr, allTxs);
    const netAda = f.adaReceived - f.adaSent;
    const netCol = netAda > 0 ? 'var(--accent)' : netAda < 0 ? 'var(--red)' : 'var(--muted)';
    const cardanoscanUrl = `https://cardanoscan.io/address/${addr}`;
    const allTokenUnits = new Set([...f.tokReceived.keys(), ...f.tokSent.keys()]);
    const tokenChips = [...allTokenUnits].map(unit => {
      const rec = f.tokReceived.get(unit) || 0;
      const snt = f.tokSent.get(unit)     || 0;
      const net = rec - snt;
      if (net === 0) return '';
      const name = formatAssetName(unit.slice(56)) || 'null';
      const url  = `https://adastat.net/tokens/${unit}`;
      const c    = net > 0 ? 'var(--accent)' : 'var(--red)';
      return `<span style="font-size:10px;font-family:var(--mono);color:${c};white-space:nowrap;">${net>0?'+':''}${fmt4sig(net)} <a href="${url}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline;">${escHtml(name)}</a></span>`;
    }).filter(Boolean).join('<span style="color:var(--border2);margin:0 4px;">·</span>');

    return `<tr>
      <td><span class="label-chip ${l.color}">${escHtml(l.name)}</span></td>
      <td style="font-family:var(--mono);font-size:10.5px;"><a href="${cardanoscanUrl}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;">${addr.slice(0,10)}…${addr.slice(-8)}</a></td>
      <td style="color:var(--muted);">${f.txCount}</td>
      <td style="font-family:var(--mono);color:var(--accent);">${fmt4sig(f.adaReceived)} ₳</td>
      <td style="font-family:var(--mono);color:var(--red);">${fmt4sig(f.adaSent)} ₳</td>
      <td style="font-family:var(--mono);color:${netCol};font-weight:600;">${netAda>=0?'+':''}${fmt4sig(netAda)} ₳</td>
      <td style="max-width:280px;flex-wrap:wrap;">${tokenChips || '<span style="color:var(--muted);font-size:11px;">—</span>'}</td>
      <td><button data-filter-addr="${escHtml(addr)}" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;" title="Filter transactions by this address">🔎</button></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="summary-table">
    <thead><tr>
      <th>Label</th><th>Address</th><th>Txs</th>
      <th>ADA Received</th><th>ADA Sent</th><th>Net ADA</th>
      <th>Tokens</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// =================================================================
// PROMPT SET DECIMALS
// =================================================================
export function promptSetDecimals(unit, name, buildPnlData, renderTable, renderTimeline, renderSummaryTable, renderTokenPnl, renderLabelsSummary) {
  const current = tokenDecimals.get(unit) ?? 6;
  const input = prompt(`Set decimal places for ${name}:\n(e.g. 6 means 1000000 on-chain = 1.0 displayed)`, current);
  if (input === null) return;
  const dec = parseInt(input);
  if (isNaN(dec) || dec < 0 || dec > 18) { alert('Please enter a whole number between 0 and 18.'); return; }
  tokenDecimals.set(unit, dec);
  userDecimalOverrides.add(unit);
  buildPnlData();
  renderTable();
  renderTimeline();
  renderSummaryTable();
  renderTokenPnl();
  renderLabelsSummary();
}
