import {
  allTxs, myAddresses, labels, tokenDecimals, userDecimalOverrides,
  activeFilterUnit, activeFilterAddr, activeFilterWindow, activeAddrFilterWindow,
  pnlTargetUnit, KNOWN_DECIMAL_POLICIES, COLLAPSE_THRESHOLD, PAGE_SIZE,
  getCurrentPage, setCurrentPage, totalStakingRewards,
} from './state.js';
import { lovelace, fmt, fmt4sig, escHtml, applyDecimals, formatAssetName, togglePanel } from './utils.js';
import { calcTxNet, isSingleTxSwap, classifyTx } from './calc.js';
import { isInTokenPnl, getTokensForTx, getMergedEntries, allPnlUnits, pnlSummaryHTML, renderPnlTotals, togglePnlToken, removeTxFromPnl } from './pnl.js';
import { getFilteredTxList, getFilteredTxListByAddr, clearAddrFilter } from './filters.js';
import { renderLabelsPanel as _renderLabelsPanel, renderLabelsSummary as _renderLabelsSummary } from './labels.js';

// Re-export for use in main.js and other callers
export { togglePanel };

// =================================================================
// META
// =================================================================
export function renderMeta(acct, count) {
  const pool = acct.pool_id ? acct.pool_id.slice(0,12)+'…' : 'Not delegating';
  const rewardsAda = lovelace(totalStakingRewards);
  document.getElementById('meta-grid').innerHTML = [
    {label:'Controlled ADA',       value:fmt(lovelace(acct.controlled_amount)),   ada:true },
    {label:'Rewards available',    value:fmt(lovelace(acct.withdrawable_amount)), ada:true },
    {label:'Total rewards earned', value:fmt(lovelace(acct.rewards_sum)),         ada:true },
    {label:'Staking rewards (loaded period)', value:fmt(rewardsAda),             ada:true },
    {label:'Transactions',         value:count.toLocaleString(),                  ada:false},
    {label:'Stake pool',           value:pool,                                    ada:false},
  ].map(c=>`<div class="metric"><div class="metric-label">${c.label}</div><div class="metric-value${c.ada?' ada':''}">${c.value}</div></div>`).join('');
}

export function renderMetaFromImport() {
  const rewardsAda = lovelace(totalStakingRewards);
  document.getElementById('meta-grid').innerHTML = [
    { label:'Staking rewards (loaded period)', value:fmt(rewardsAda), ada:true },
    { label:'Transactions', value:allTxs.length.toLocaleString(), ada:false },
    { label:'Own addresses', value:myAddresses.size.toLocaleString(), ada:false },
    { label:'Source', value:'Imported file', ada:false },
  ].map(c=>`<div class="metric"><div class="metric-label">${c.label}</div><div class="metric-value${c.ada?' ada':''}">${c.value}</div></div>`).join('');
}

// =================================================================
// UTXO HELPERS
// =================================================================
function tokenAmounts(amounts) {
  return (amounts||[]).filter(a=>a.unit!=='lovelace').map(t=>{
    const qty = fmt4sig(applyDecimals(t.quantity, t.unit));
    const name = formatAssetName(t.unit.slice(56)) || 'null';
    const url  = `https://adastat.net/tokens/${t.unit}`;
    const policyId = t.unit.slice(0,56);
    const isUserSet = userDecimalOverrides.has(t.unit);
    const isKnown   = KNOWN_DECIMAL_POLICIES.has(policyId);
    const badge = isUserSet
      ? `<span title="Decimals set manually (${tokenDecimals.get(t.unit)})" style="color:var(--accent);font-size:9px;">✓</span>`
      : !isKnown
        ? `<button data-set-decimals="${t.unit}" data-token-name="${escHtml(name)}" title="Decimals unknown — click to set manually" style="background:none;border:none;color:var(--amber);font-size:9px;cursor:pointer;padding:0;">⚠ set</button>`
        : '';
    return `<div style="font-size:10.5px;color:var(--amber);font-family:var(--mono);margin-top:2px;word-break:break-all;">
      ${qty} <a href="${url}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline;">${escHtml(name)}</a> ${badge}
      <span style="color:var(--muted);font-size:9.5px;display:block;">${policyId}</span>
    </div>`;
  }).join('');
}

function utxoRows(list, txHash, side) {
  if (!list||!list.length) return '<span style="color:var(--muted);font-size:12px">—</span>';
  const nc = list.length > COLLAPSE_THRESHOLD;
  const rows = list.map((u,i) => {
    const addr = u.address||'', adaAmt = u.amount?.find(a=>a.unit==='lovelace');
    const adaVal = adaAmt ? fmt(parseInt(adaAmt.quantity)/1_000_000)+' ₳' : '—';
    const isOwn = myAddresses.has(addr);
    const label = labels.get(addr);
    const labelChip = label ? `<span class="label-chip ${label.color}">${escHtml(label.name)}</span>` : '';
    return `<div class="utxo-entry${nc&&i>=COLLAPSE_THRESHOLD?' hidden':''}">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="utxo-ada">${adaVal}</span>${labelChip}</div>
      ${tokenAmounts(u.amount)}
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="label-star-btn" data-addr="${escHtml(addr)}" title="${label?'Edit label':'Add label'}">${label?'★':'☆'}</button>
        <span data-click-addr="${escHtml(addr)}" style="cursor:pointer;font-family:var(--mono);font-size:11px;word-break:break-all;${isOwn?'color:var(--accent);':'color:var(--muted);'}text-decoration-style:dotted;text-underline-offset:2px;" title="Click to filter transactions by this address">${escHtml(addr)}</span>
      </div>
    </div>`;
  }).join('');
  const btn = nc ? `<button class="utxo-expand-btn" data-hash="${txHash}" data-side="${side}" data-expanded="false">Show ${list.length-COLLAPSE_THRESHOLD} more ▾</button>` : '';
  return `<div class="utxo-list">${rows}${btn}</div>`;
}

function collateralDetails(tx) {
  const secs = [];
  if (tx.collateralInputs?.length)  secs.push({label:`Collateral Inputs (${tx.collateralInputs.length})`,  list:tx.collateralInputs});
  if (tx.referenceInputs?.length)   secs.push({label:`Reference Inputs (${tx.referenceInputs.length})`,   list:tx.referenceInputs});
  if (tx.collateralOutputs?.length) secs.push({label:`Collateral Outputs (${tx.collateralOutputs.length})`,list:tx.collateralOutputs});
  if (!secs.length) return '';
  return `<details style="margin-top:6px;"><summary style="font-size:10px;color:var(--muted);cursor:pointer;user-select:none;">▸ Collateral / Reference</summary>
    <div style="margin-top:6px;padding:8px;background:var(--surface2);border-radius:8px;">
      ${secs.map(s=>`<div style="margin-bottom:6px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">${s.label}</div>${utxoRows(s.list,s.label,'collateral')}</div>`).join('')}
    </div></details>`;
}

export function getLabeledAddressesForTx(tx) {
  const seen = new Set();
  const result = [];
  [...(tx.inputs||[]), ...(tx.outputs||[])].forEach(u => {
    const addr = u.address;
    if (!addr || seen.has(addr)) return;
    const label = labels.get(addr);
    if (label) { seen.add(addr); result.push(label); }
  });
  return result;
}

// =================================================================
// TRANSACTION LOG
// =================================================================
export function renderTable() {
  if (!allTxs.length) return;

  let sourceList;
  if (activeFilterUnit) {
    const reversed = getFilteredTxList(activeFilterUnit, activeFilterWindow).reverse();
    const chronoIndexOf = new Map([...allTxs].reverse().map((tx,i)=>[tx.hash,i]));
    reversed.forEach((item, idx) => {
      if (idx===0) { item.groupStart=true; return; }
      const prevIdx = chronoIndexOf.get(reversed[idx-1].tx.hash);
      const curIdx  = chronoIndexOf.get(item.tx.hash);
      item.groupStart = curIdx !== prevIdx-1;
    });
    sourceList = reversed;
  } else if (activeFilterAddr) {
    const addrList = getFilteredTxListByAddr(activeFilterAddr).reverse();
    const chronoIndexOf = new Map([...allTxs].reverse().map((tx,i)=>[tx.hash,i]));
    addrList.forEach((item,idx) => {
      if (idx===0) { item.groupStart=true; return; }
      const prevIdx = chronoIndexOf.get(addrList[idx-1].tx.hash);
      const curIdx  = chronoIndexOf.get(item.tx.hash);
      item.groupStart = curIdx !== prevIdx-1;
    });
    sourceList = addrList;
  } else {
    sourceList = allTxs.map(tx => ({ tx, isAnchor:false }));
  }

  const page = sourceList.slice((getCurrentPage()-1)*PAGE_SIZE, getCurrentPage()*PAGE_SIZE);

  document.getElementById('tx-body').innerHTML = page.map(({tx, isAnchor, groupStart}, pageIdx) => {
    const { adaNet, tokenNet } = calcTxNet(tx);
    const date = new Date(tx.time*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const adaCol = adaNet>=0 ? 'var(--accent)' : 'var(--red)';
    const adaStr = `<span style="font-family:var(--mono);font-size:12px;color:${adaCol};">${adaNet>=0?'+':''}${fmt(adaNet,4)} ₳</span>`;
    const tokenSummary = [...tokenNet.entries()].map(([unit,net]) => {
      const name = formatAssetName(unit.slice(56)) || 'null';
      const url  = `https://adastat.net/tokens/${unit}`;
      const c    = net>=0 ? 'var(--accent)' : 'var(--red)';
      return `<span style="font-family:var(--mono);font-size:11px;color:${c};margin-right:10px;">${net>=0?'+':''}${fmt4sig(net)} <a href="${url}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline;">${escHtml(name)}</a></span>`;
    }).join('');

    const txLabels = getLabeledAddressesForTx(tx);
    const visibleLabels = txLabels.slice(0, 2);
    const extraLabelCount = txLabels.length - visibleLabels.length;
    const labelChipsHtml = visibleLabels.map(l=>`<span class="label-chip ${l.color}">${escHtml(l.name)}</span>`).join('')
      + (extraLabelCount>0 ? `<span class="label-chip" style="background:var(--surface2);color:var(--muted);">+${extraLabelCount}</span>` : '');

    const utxoDetail = `<details style="margin-top:6px;">
      <summary style="font-size:10px;color:var(--muted);cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
        <span>▸ Inputs / Outputs</span><span style="color:var(--border2);">·</span><span>${tx.inputs.length} in / ${tx.outputs.length} out</span>
        ${labelChipsHtml ? `<span style="margin-left:auto;display:inline-flex;gap:4px;">${labelChipsHtml}</span>` : ''}
      </summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;padding:8px;background:var(--surface2);border-radius:8px;">
        <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Inputs</div>${utxoRows(tx.inputs,tx.hash,'inputs')}</div>
        <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Outputs</div>${utxoRows(tx.outputs,tx.hash,'outputs')}</div>
      </div>${collateralDetails(tx)}</details>`;

    const effectiveUnit = activeFilterUnit || pnlTargetUnit;
    const isMember = effectiveUnit ? isInTokenPnl(effectiveUnit, tx.hash) : false;
    const addBtnDisabled = !effectiveUnit;
    const targetName = effectiveUnit ? (formatAssetName(effectiveUnit.slice(56)) || 'token') : '';
    const addBtnTitle = effectiveUnit
      ? (isMember ? `Remove from ${targetName} P&L` : `Add to ${targetName} P&L`)
      : 'Filter to a token (🔎) or target a token in P&L (⊕) to enable';

    const pnlUnits = getTokensForTx(tx.hash);
    const pnlNames = pnlUnits.map(u => formatAssetName(u.slice(56)) || 'null');
    const visibleNames = pnlNames.slice(0, 2);
    const extraCount = pnlNames.length - visibleNames.length;
    const chipHtml = visibleNames.map(n=>`<span style="font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:var(--amber-dim);color:var(--amber);">${escHtml(n)}</span>`).join('')
      + (extraCount>0 ? `<span style="font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:var(--amber-dim);color:var(--amber);">+${extraCount}</span>` : '');

    const cls = classifyTx(tx);
    const typeLine = `<div style="margin-top:3px;font-size:10px;color:var(--muted);display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
      <span>${cls.icon}</span><span>${escHtml(cls.label)}</span>
      ${cls.counterparty ? `<span style="color:var(--border2);">·</span><span style="font-family:var(--mono);">…${escHtml(cls.counterparty)}</span>` : ''}
    </div>`;
    const pnlLine = pnlNames.length
      ? `<div style="margin-top:2px;font-size:9.5px;color:var(--muted);">In P&L: ${escHtml(pnlNames.join(', '))}</div>`
      : '';
    const swapDetail = cls.detail
      ? `<div style="font-size:10.5px;font-family:var(--mono);color:var(--muted);margin-top:1px;">${escHtml(cls.detail)}</div>`
      : '';

    const contextIsOff = activeFilterUnit ? activeFilterWindow===0 : activeAddrFilterWindow===0;
    const spacerRow = (groupStart && pageIdx>0 && !contextIsOff)
      ? `<tr style="height:14px;"><td colspan="3" style="padding:0;border:none;background:var(--amber);"></td></tr>`
      : '';

    return `${spacerRow}<tr${isAnchor?' class="tx-row-anchor"':''}>
      <td class="hash-cell col-hash" style="padding-top:13px;">
        <a href="https://cardanoscan.io/transaction/${tx.hash}" target="_blank" rel="noopener">${tx.hash.slice(0,8)}…${tx.hash.slice(-6)}</a>
        <button class="pnl-add-btn${isMember?' active':''}" data-pnl-add="${tx.hash}" ${addBtnDisabled?'disabled':''} title="${addBtnTitle}">${isMember?'✓':'+'}</button>
        ${chipHtml ? `<span style="display:inline-flex;gap:3px;margin-left:4px;vertical-align:middle;">${chipHtml}</span>` : ''}
        ${typeLine}
        ${pnlLine}
      </td>
      <td class="col-date" style="font-size:12px;color:var(--muted);padding-top:13px;">${date}</td>
      <td class="col-summary">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding-top:2px;">${adaStr}${tokenSummary}</div>
        ${swapDetail}${utxoDetail}
      </td>
    </tr>`;
  }).join('');
  renderPagination();
}

// =================================================================
// PAGINATION
// =================================================================
function buildPageList(current, total) {
  const pages = [];
  for (let p=1; p<=total; p++) {
    if (p===1 || p===total || Math.abs(p-current)<=1) pages.push(p);
    else if (pages[pages.length-1] !== '...') pages.push('...');
  }
  return pages;
}

export function renderPagination() {
  const count = activeFilterUnit
    ? getFilteredTxList(activeFilterUnit, activeFilterWindow).length
    : activeFilterAddr
      ? getFilteredTxListByAddr(activeFilterAddr).length
      : allTxs.length;
  const total = Math.ceil(count/PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (total<=1) { pg.innerHTML=''; return; }

  const pageList = buildPageList(getCurrentPage(), total);
  const hasEllipsis = pageList.includes('...');
  const numberButtons = pageList.map(p =>
    p==='...'
      ? `<span style="color:var(--muted);padding:0 4px;">…</span>`
      : `<button class="btn btn-ghost btn-sm" data-goto-page="${p}" style="${p===getCurrentPage()?'background:var(--accent-dim);color:var(--accent);border-color:var(--accent);':''}min-width:30px;">${p}</button>`
  ).join('');

  const jumpInput = hasEllipsis
    ? `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;">
        <span style="color:var(--muted);font-size:12px;">Go to</span>
        <input type="number" min="1" max="${total}" id="page-jump-input" data-total="${total}"
          style="width:54px;background:var(--bg);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-size:12px;padding:5px 6px;outline:none;"/>
        <button class="btn btn-ghost btn-sm" id="page-jump-go" data-total="${total}">Go</button>
      </span>`
    : '';

  pg.innerHTML = `<button class="btn btn-ghost" data-goto-page="${getCurrentPage()-1}" ${getCurrentPage()===1?'disabled':''}>← Prev</button>
    ${numberButtons}
    <button class="btn btn-ghost" data-goto-page="${getCurrentPage()+1}" ${getCurrentPage()===total?'disabled':''}>Next →</button>
    ${jumpInput}`;
}

export function goPage(p) { setCurrentPage(p); renderTable(); }

export function jumpToPage(total) {
  const input = document.getElementById('page-jump-input');
  const v = parseInt(input.value);
  if (isNaN(v)) return;
  goPage(Math.max(1, Math.min(total, v)));
}

// =================================================================
// TIMELINE
// =================================================================
export function renderTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas || !allTxs.length) return;
  const dpr=window.devicePixelRatio||1, W=canvas.parentElement.clientWidth, H=110;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const txs=[...allTxs].reverse();
  const nets=txs.map(tx=>calcTxNet(tx).adaNet);
  const maxAbs=Math.max(...nets.map(Math.abs),0.01);
  const PAD={top:10,bottom:24,left:4,right:4};
  const cW=W-PAD.left-PAD.right, cH=H-PAD.top-PAD.bottom, midY=PAD.top+cH/2;
  const barW=Math.max(2,Math.floor(cW/txs.length)-1);
  ctx.fillStyle='#131929'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD.left,midY); ctx.lineTo(W-PAD.right,midY); ctx.stroke();
  txs.forEach((tx,i)=>{
    const net=nets[i], x=PAD.left+i*(cW/txs.length);
    const barH=Math.max(2,(Math.abs(net)/maxAbs)*(cH/2));
    const y=net>=0?midY-barH:midY;
    ctx.fillStyle=isSingleTxSwap(tx)?(net>=0?'#4fffce':'#ff9999'):(net>=0?'#0cd9a0':'#f87171');
    ctx.fillRect(x,y,barW,barH);
  });
  [0,Math.floor(txs.length/2),txs.length-1].forEach(i=>{
    if (i>=txs.length) return;
    const ds=new Date(txs[i].time*1000).toLocaleDateString('en-US',{month:'short',year:'2-digit'});
    const x=PAD.left+i*(cW/txs.length);
    ctx.fillStyle='#7b859e'; ctx.font='10px -apple-system,sans-serif';
    ctx.textAlign=i===0?'left':i===txs.length-1?'right':'center';
    ctx.fillText(ds,x+barW/2,H-6);
  });
  const tip=document.getElementById('timeline-tooltip');
  canvas.onmousemove=e=>{
    const rect=canvas.getBoundingClientRect(), relX=e.clientX-rect.left-PAD.left;
    const idx=Math.max(0,Math.min(Math.floor(relX/(cW/txs.length)),txs.length-1));
    const tx=txs[idx], {adaNet}=calcTxNet(tx);
    const date=new Date(tx.time*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const c=adaNet>=0?'var(--accent)':'var(--red)';
    tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-32)+'px';
    tip.innerHTML=`<span style="color:var(--muted);">${date}</span>${isSingleTxSwap(tx)?'&nbsp;<span class="swap-badge">swap</span>':''}<br><span style="font-family:var(--mono);color:${c};">${adaNet>=0?'+':''}${fmt(adaNet,4)} ₳</span>`;
  };
  canvas.onmouseleave=()=>{ tip.style.display='none'; };
  canvas.onclick=e=>{
    const rect=canvas.getBoundingClientRect(), relX=e.clientX-rect.left-PAD.left;
    const idx=Math.max(0,Math.min(Math.floor(relX/(cW/txs.length)),txs.length-1));
    scrollToTx(txs[idx].hash);
  };
}

export function renderDateRange() {
  if (!allTxs.length) return;
  const oldest=new Date(allTxs[allTxs.length-1].time*1000), newest=new Date(allTxs[0].time*1000);
  const f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('date-range').textContent=`${f(oldest)} – ${f(newest)}`;
  document.getElementById('tx-count-label').textContent=`Transaction Log — ${allTxs.length} transactions`;
}

// =================================================================
// TOKEN SUMMARY
// =================================================================
export function renderSummaryTable() {
  const panel=document.getElementById('summary-panel'), wrap=document.getElementById('summary-table-wrap');
  const units=allPnlUnits();
  if (!units.size) { panel.style.display='none'; return; }
  panel.style.display='block';
  const rows=[...units].map(unit=>{
    const entries=getMergedEntries(unit);
    const name=formatAssetName(unit.slice(56))||'null';
    const url=`https://adastat.net/tokens/${unit}`;
    let adaPaid=0,adaRec=0,tkBought=0,tkSold=0;
    entries.forEach(e=>{
      if (e.adaNet<0) adaPaid+=Math.abs(e.adaNet);
      if (e.adaNet>0) adaRec+=e.adaNet;
      if (e.tokenNet>0) tkBought+=e.tokenNet;
      if (e.tokenNet<0) tkSold+=Math.abs(e.tokenNet);
    });
    const gain=adaRec-adaPaid, gc=gain>0?'var(--accent)':gain<0?'var(--red)':'var(--muted)';
    const avgBuy=tkBought>0?fmt4sig(adaPaid/tkBought):'—';
    const avgSell=tkSold>0?fmt4sig(adaRec/tkSold):'—';
    return `<tr>
      <td><a href="${url}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline;">${escHtml(name)}</a></td>
      <td style="color:var(--accent);">${fmt4sig(tkBought)}</td>
      <td style="color:var(--red);">${fmt4sig(tkSold)}</td>
      <td style="color:var(--muted);">${avgBuy}</td>
      <td style="color:var(--muted);">${avgSell}</td>
      <td style="color:var(--red);">${fmt4sig(adaPaid)} ₳</td>
      <td style="color:var(--accent);">${fmt4sig(adaRec)} ₳</td>
      <td style="color:${gc};font-weight:600;">${gain>=0?'+':''}${fmt4sig(gain)} ₳</td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`<table class="summary-table">
    <thead><tr><th>Token</th><th>Bought</th><th>Sold</th><th>Avg Buy (₳/tkn)</th><th>Avg Sell (₳/tkn)</th><th>ADA Paid</th><th>ADA Received</th><th>Net Gain</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// =================================================================
// TOKEN P&L PANEL
// =================================================================
export function renderTokenPnl() {
  const sidebar=document.getElementById('token-pnl-sidebar'), list=document.getElementById('token-pnl-list');
  const units=allPnlUnits();
  if (!units.size) { sidebar.style.display='none'; return; }
  sidebar.style.display='block';
  const openUnits=new Set();
  list.querySelectorAll('.pnl-token-body.open').forEach(el=>openUnits.add(el.dataset.unit));
  list.innerHTML=[...units].map(unit=>{
    const entries=getMergedEntries(unit);
    const name=formatAssetName(unit.slice(56))||'null', url=`https://adastat.net/tokens/${unit}`;
    const totalIn=entries.filter(e=>e.tokenNet>0).reduce((s,e)=>s+e.tokenNet,0);
    const totalOut=entries.filter(e=>e.tokenNet<0).reduce((s,e)=>s+Math.abs(e.tokenNet),0);
    const netPos=totalIn-totalOut, netColor=netPos>=0?'var(--accent)':'var(--red)';
    const bodyId=`pnl-body-${unit}`;
    const isFiltering=activeFilterUnit===unit, isTargeting=pnlTargetUnit===unit;
    const txRows=entries.map(e=>{
      const tColor=e.tokenNet>0?'var(--accent)':'var(--red)', adaColor=e.adaNet>=0?'var(--accent)':'var(--red)';
      const tknStr=`${e.tokenNet>0?'+':''}${fmt4sig(e.tokenNet)}`;
      const adaStr=`${e.adaNet>=0?'+':''}${fmt4sig(e.adaNet)}`;
      return `<div class="pnl-tx-row">
        <span class="pnl-tx-link" data-hash="${e.hash}">${e.hash.slice(0,8)}…${e.hash.slice(-6)}</span>
        <span style="color:var(--muted);font-size:10.5px;">${e.date}</span>
        <span style="font-family:var(--mono);color:${tColor};font-size:11px;text-align:right;">${tknStr}</span>
        <span style="font-family:var(--mono);color:${adaColor};font-size:11px;text-align:right;">${adaStr}</span>
        <button class="pnl-remove-btn" data-remove-unit="${unit}" data-remove-hash="${e.hash}" title="Remove from this token's P&L">✕</button>
      </div>`;
    }).join('');
    const colHeader = `<div class="pnl-tx-row" style="opacity:0.5;font-size:10px;border-bottom:1px solid var(--border);padding-bottom:4px;margin-bottom:2px;">
      <span style="color:var(--muted);">TX</span>
      <span style="color:var(--muted);">Date</span>
      <span style="color:var(--muted);text-align:right;">Tkn</span>
      <span style="color:var(--muted);text-align:right;">₳</span>
      <span></span>
    </div>`;
    return `<div class="pnl-token-row" data-unit="${unit}">
      <div class="pnl-token-header${isFiltering?' filtering':''}${isTargeting?' targeting':''}" data-toggle-pnl-token="${unit}">
        <span class="pnl-token-name"><a href="${url}" target="_blank" rel="noopener" style="color:var(--amber);text-decoration:underline;">${escHtml(name)}</a></span>
        <button data-filter-token="${unit}" data-filter-token-name="${escHtml(name)}"
          title="${isFiltering?'Currently filtering':'Filter the Transaction Log to this token'}"
          style="background:none;border:none;color:${isFiltering?'var(--amber)':'var(--muted)'};cursor:pointer;font-size:12px;padding:0 4px;">🔎</button>
        <button data-target-pnl="${unit}"
          title="${isTargeting?'Deselect as P&L target':'Target this token — + button will add address-filtered txs here'}"
          style="background:none;border:none;color:${isTargeting?'var(--accent)':'var(--muted)'};cursor:pointer;font-size:13px;padding:0 2px;">⊕</button>
        <span class="pnl-stat" style="color:${netColor};">Net ${netPos>=0?'+':''}${fmt4sig(netPos)} tkn</span>
      </div>
      <div class="pnl-token-body${openUnits.has(unit)?' open':''}" id="${bodyId}" data-unit="${unit}">
        ${colHeader}${txRows}
        <div class="pnl-summary-box">${pnlSummaryHTML(unit,entries)}</div>
      </div>
    </div>`;
  }).join('');
  renderPnlTotals();
  list.querySelectorAll('.pnl-tx-link').forEach(el=>el.addEventListener('click',()=>{
    if (activeFilterAddr) clearAddrFilter(renderTable, renderTokenPnl);
    scrollToTx(el.dataset.hash);
  }));
  list.querySelectorAll('[data-remove-unit]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    removeTxFromPnl(btn.dataset.removeUnit, btn.dataset.removeHash, renderTokenPnl, renderSummaryTable, renderTable);
  }));
}

// =================================================================
// SCROLL TO TX
// =================================================================
export function scrollToTx(hash) {
  let sourceList;
  if (activeFilterUnit) sourceList = getFilteredTxList(activeFilterUnit, activeFilterWindow).reverse();
  else if (activeFilterAddr) sourceList = getFilteredTxListByAddr(activeFilterAddr).reverse();
  else sourceList = allTxs.map(tx=>({tx}));

  const posInView = sourceList.findIndex(item=>item.tx.hash===hash);
  if (posInView === -1) {
    const idxInAll = allTxs.findIndex(t=>t.hash===hash);
    if (idxInAll === -1) return;
    const tp = Math.floor(idxInAll/PAGE_SIZE)+1;
    if (tp !== getCurrentPage()) { setCurrentPage(tp); renderTable(); }
  } else {
    const tp = Math.floor(posInView/PAGE_SIZE)+1;
    if (tp !== getCurrentPage()) { setCurrentPage(tp); renderTable(); }
  }
  requestAnimationFrame(()=>{
    const row=[...document.querySelectorAll('.hash-cell a')].find(a=>a.href.includes(hash))?.closest('tr');
    if (!row) return;
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.style.transition='background 0.2s'; row.style.background='rgba(12,217,160,0.12)';
    setTimeout(()=>{ row.style.background=''; },1800);
  });
}

// Wrapper re-exports for labels (avoids render.js importing from labels.js and vice versa)
export function renderLabelsPanel(filterAddr, onDelete) { _renderLabelsPanel(filterAddr, onDelete); }
export function renderLabelsSummary()                   { _renderLabelsSummary(); }
