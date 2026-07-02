import {
  BASE, API_KEY, KNOWN_DECIMALS,
  allTxs, setAllTxs, myAddresses, setMyAddresses,
  totalStakingRewards, setTotalStakingRewards,
  tokenDecimals, userDecimalOverrides, labels,
  pnlData, pnlManualEntries, pnlRemovedAuto,
  activeFilterUnit, setActiveFilterUnit, lastFilterUnit, setLastFilterUnit,
  activeFilterAddr, setActiveFilterAddr, lastFilterAddr, setLastFilterAddr,
  activeFilterWindow, setActiveFilterWindow,
  activeAddrFilterWindow, setActiveAddrFilterWindow,
  pnlTargetUnit, setPnlTargetUnit,
  resetPageCounters,
} from './state.js';
import { setStatus, showSkeleton, lovelace, fmt } from './utils.js';
import { buildPnlData, calcTxNet, isSingleTxSwap } from './calc.js';
import {
  renderTable, renderTimeline, renderDateRange, renderSummaryTable,
  renderTokenPnl, renderLabelsPanel, renderLabelsSummary, renderMeta, renderMetaFromImport,
} from './render.js';

async function bf(path) {
  const r = await fetch(BASE+path, {headers:{project_id:API_KEY}});
  if (!r.ok) { const j=await r.json().catch(()=>({})); throw new Error(j.message||`HTTP ${r.status}`); }
  return r.json();
}

function resetState() {
  pnlData.clear();
  pnlManualEntries.clear();
  pnlRemovedAuto.clear();
  userDecimalOverrides.clear();
  labels.clear();
  tokenDecimals.clear();
  setActiveFilterUnit(null); setLastFilterUnit(null); setPnlTargetUnit(null);
  setActiveFilterWindow(3);
  document.getElementById('tx-filter-banner').style.display = 'none';
  setActiveFilterAddr(null); setLastFilterAddr(null);
  setActiveAddrFilterWindow(3);
  document.getElementById('addr-filter-banner').style.display = 'none';
}

export async function fetchAccount() {
  const stake    = document.getElementById('stake').value.trim();
  const limitVal = document.getElementById('tx-limit').value;
  const fetchAll = limitVal==='all', limit = fetchAll?Infinity:parseInt(limitVal);
  if (!stake) return setStatus('Enter a stake address.', true);

  document.getElementById('results').style.display = 'none';
  document.getElementById('search-btn').disabled = true;
  resetState();
  tokenDecimals.clear(); // also clear decimals on new search
  setStatus('<span class="spinner"></span> Fetching account…');

  try {
    const [acct, ownAddrs, rewardsRaw] = await Promise.all([
      bf(`/accounts/${stake}`),
      bf(`/accounts/${stake}/addresses?count=100`).catch(()=>[]),
      bf(`/accounts/${stake}/rewards?count=100&order=desc`).catch(()=>[]),
    ]);
    setMyAddresses(new Set(ownAddrs.map(a=>a.address)));
    setTotalStakingRewards(rewardsRaw
      .filter(r=>r.type==='member'||r.type==='leader')
      .reduce((s,r)=>s+parseInt(r.amount),0));

    let rawTxs=[], page=1;
    while (true) {
      const batch = await bf(`/accounts/${stake}/transactions?count=100&page=${page}&order=desc`);
      rawTxs = rawTxs.concat(batch);
      setStatus(`<span class="spinner"></span> Loading… ${rawTxs.length} transactions`);
      if (batch.length<100) break;
      if (!fetchAll && rawTxs.length>=limit) break;
      page++;
    }

    const seen = new Set();
    const txList = rawTxs.filter(t=>{if(seen.has(t.tx_hash))return false;seen.add(t.tx_hash);return true;}).slice(0,fetchAll?Infinity:limit);

    const utxos = [];
    for (let i=0; i<txList.length; i+=10) {
      if (i>0) await new Promise(r=>setTimeout(r,100));
      const batch = await Promise.all(txList.slice(i,i+10).map(t=>bf(`/txs/${t.tx_hash}/utxos`).catch(()=>null)));
      utxos.push(...batch);
      setStatus(`<span class="spinner"></span> Fetching UTxOs… ${Math.min(i+10,txList.length)} / ${txList.length}`);
    }

    setAllTxs(txList.map((t,i)=>{
      const u=utxos[i];
      return {
        hash:t.tx_hash, time:t.block_time, block:t.block_height,
        inputs:            u?u.inputs.filter(x=>!x.collateral&&!x.reference):[],
        outputs:           u?u.outputs.filter(x=>!x.collateral):[],
        collateralInputs:  u?u.inputs.filter(x=>x.collateral):[],
        referenceInputs:   u?u.inputs.filter(x=>x.reference):[],
        collateralOutputs: u?u.outputs.filter(x=>x.collateral):[],
      };
    }));

    const allUnits = new Set();
    allTxs.forEach(tx=>[...tx.inputs,...tx.outputs].forEach(u=>(u.amount||[]).forEach(a=>{if(a.unit!=='lovelace')allUnits.add(a.unit);})));
    allUnits.forEach(unit=>{
      if (!tokenDecimals.has(unit)) tokenDecimals.set(unit, KNOWN_DECIMALS[unit.slice(0,56)] ?? 6);
    });

    buildPnlData(allTxs, pnlData);
    renderMeta(acct, txList.length);
    resetPageCounters();
    document.getElementById('results').style.display = 'block';
    showSkeleton();
    renderTable();
    renderTimeline();
    renderDateRange();
    renderSummaryTable();
    renderTokenPnl();
    renderLabelsPanel(filterTxLogByAddrProxy, deleteLabelProxy);
    renderLabelsSummary();
    setStatus('');

  } catch(e) {
    setStatus('Error: '+e.message, true);
  } finally {
    document.getElementById('search-btn').disabled = false;
  }
}

// Proxy to break circular dependency — filterTxLogByAddr is in filters.js
// which imports from state.js, not api.js. We pass it as a callback.
let filterTxLogByAddrProxy = () => {};
let deleteLabelProxy       = () => {};
export function setFilterTxLogByAddrProxy(fn) { filterTxLogByAddrProxy = fn; }
export function setDeleteLabelProxy(fn)        { deleteLabelProxy = fn; }

export function importJSON(file, filterTxLogByAddr) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const payload = JSON.parse(e.target.result);
      if (!payload.allTxs) throw new Error('File does not look like a valid export.');

      resetState();
      // Don't call tokenDecimals.clear() here — it's restored from file below

      setMyAddresses(new Set(payload.myAddresses || []));
      (payload.tokenDecimals||[]).forEach(([u,d])=>tokenDecimals.set(u,d));
      (payload.userDecimalOverrides||[]).forEach(u=>userDecimalOverrides.add(u));
      (payload.labels||[]).forEach(([a,l])=>labels.set(a,l));
      (payload.pnlManualEntries||[]).forEach(([u,e])=>pnlManualEntries.set(u,new Map(e)));
      (payload.pnlRemovedAuto||[]).forEach(([u,h])=>pnlRemovedAuto.set(u,new Set(h)));
      setTotalStakingRewards(payload.totalStakingRewards||0);
      setAllTxs(payload.allTxs);

      buildPnlData(allTxs, pnlData);
      renderMetaFromImport();
      resetPageCounters();
      document.getElementById('results').style.display = 'block';
      renderTable();
      renderTimeline();
      renderDateRange();
      renderSummaryTable();
      renderTokenPnl();
      renderLabelsPanel(filterTxLogByAddr, deleteLabelProxy);
      renderLabelsSummary();
      setStatus(`Loaded ${allTxs.length} transactions from file (exported ${payload.exportedAt?new Date(payload.exportedAt).toLocaleString():'unknown date'}).`);

    } catch(err) {
      setStatus('Import error: '+err.message, true);
    }
  };
  reader.readAsText(file);
}

export function exportJSON() {
  const payload = {
    version:2, exportedAt:new Date().toISOString(),
    myAddresses:[...myAddresses],
    tokenDecimals:[...tokenDecimals.entries()],
    userDecimalOverrides:[...userDecimalOverrides],
    labels:[...labels.entries()],
    pnlManualEntries:[...pnlManualEntries.entries()].map(([u,m])=>[u,[...m.entries()]]),
    pnlRemovedAuto:[...pnlRemovedAuto.entries()].map(([u,s])=>[u,[...s]]),
    totalStakingRewards, allTxs,
  };
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
  a.download=`cardano-explorer-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

export function exportCSV() {
  const rows=[['TX Hash','Date','ADA Net','Swap','Block']];
  allTxs.forEach(tx=>{
    const {adaNet}=calcTxNet(tx);
    rows.push([tx.hash,new Date(tx.time*1000).toLocaleDateString('en-US'),fmt(adaNet,6),isSingleTxSwap(tx)?'yes':'',tx.block||'']);
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='cardano-transactions.csv';
  a.click();
}
