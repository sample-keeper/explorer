import { myAddresses, pnlData, tokenDecimals, KNOWN_DECIMALS } from './state.js';
import { applyDecimals, fmt, fmt4sig, formatAssetName } from './utils.js';

// =================================================================
// WALLET NET CALCULATION
// Returns { adaNet, tokenNet } relative to myAddresses.
// Positive = received, negative = sent.
// =================================================================
export function calcTxNet(tx) {
  let adaIn=0, adaOut=0;
  const tokIn=new Map(), tokOut=new Map();
  (tx.inputs||[]).forEach(u => {
    if (!myAddresses.has(u.address)) return;
    (u.amount||[]).forEach(a => {
      if (a.unit==='lovelace') adaIn+=parseInt(a.quantity);
      else tokIn.set(a.unit, (tokIn.get(a.unit)||0) + applyDecimals(a.quantity, a.unit));
    });
  });
  (tx.outputs||[]).forEach(u => {
    if (!myAddresses.has(u.address)) return;
    (u.amount||[]).forEach(a => {
      if (a.unit==='lovelace') adaOut+=parseInt(a.quantity);
      else tokOut.set(a.unit, (tokOut.get(a.unit)||0) + applyDecimals(a.quantity, a.unit));
    });
  });
  const adaNet = (adaOut-adaIn)/1_000_000;
  const tokenNet = new Map();
  new Set([...tokIn.keys(),...tokOut.keys()]).forEach(u => {
    const n = (tokOut.get(u)||0) - (tokIn.get(u)||0);
    if (n !== 0) tokenNet.set(u, n);
  });
  return { adaNet, tokenNet };
}

// Auto-detect single-tx DEX swaps: ADA out + tokens in, or ADA in + tokens out
export function isSingleTxSwap(tx) {
  const { adaNet, tokenNet } = calcTxNet(tx);
  if (tokenNet.size===0) return false;
  return (adaNet < -0.5 && [...tokenNet.values()].some(n=>n>0))
      || (adaNet >  0.5 && [...tokenNet.values()].some(n=>n<0));
}

// Pick the "other side" of a transaction: the non-wallet address
// with the largest ADA amount. Used for swap counterparty display.
export function findCounterpartyAddr(tx) {
  const candidates = [];
  (tx.inputs||[]).forEach(u => { if (!myAddresses.has(u.address)) {
    const ada = u.amount?.find(a=>a.unit==='lovelace');
    candidates.push({ addr:u.address, ada: ada?parseInt(ada.quantity):0 });
  }});
  (tx.outputs||[]).forEach(u => { if (!myAddresses.has(u.address)) {
    const ada = u.amount?.find(a=>a.unit==='lovelace');
    candidates.push({ addr:u.address, ada: ada?parseInt(ada.quantity):0 });
  }});
  if (!candidates.length) return null;
  candidates.sort((a,b)=>b.ada-a.ada);
  return candidates[0].addr;
}

// Classify a transaction — returns { icon, label, detail?, counterparty? }
export function classifyTx(tx) {
  const { adaNet, tokenNet } = calcTxNet(tx);

  const allInternal = [...(tx.inputs||[]), ...(tx.outputs||[])].every(u => myAddresses.has(u.address));
  if (allInternal && (tx.inputs||[]).length && (tx.outputs||[]).length) {
    return { icon:'🔁', label:'Internal transfer' };
  }

  if (isSingleTxSwap(tx)) {
    const [unit, tNet] = [...tokenNet.entries()][0] || [];
    const name = unit ? (formatAssetName(unit.slice(56)) || 'token') : 'token';
    const cpAddr = findCounterpartyAddr(tx);
    const cpTail = cpAddr ? cpAddr.slice(-6) : null;
    const detail = unit
      ? (tNet > 0
          ? `${fmt(Math.abs(adaNet),2)} ₳ → ${fmt4sig(tNet)} ${name}`
          : `${fmt4sig(Math.abs(tNet))} ${name} → ${fmt(adaNet,2)} ₳`)
      : '';
    return { icon:'⇄', label:'Swap', detail, counterparty: cpTail };
  }

  if (tokenNet.size > 0) return { icon:'📦', label:'Token transfer' };
  if (adaNet > 0) return { icon:'🎁', label:'Possible reward / ADA received' };
  if (adaNet < 0) return { icon:'↑', label:'Sent ADA' };
  return { icon:'•', label:'No wallet change' };
}

// Build auto-detected P&L data from every tx that touches a token.
// Receives pnlData and allTxs as parameters to avoid circular imports.
export function buildPnlData(allTxs, pnlData) {
  pnlData.clear();
  allTxs.forEach(tx => {
    const { adaNet, tokenNet } = calcTxNet(tx);
    if (tokenNet.size===0) return;
    const date = new Date(tx.time*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    tokenNet.forEach((tNet, unit) => {
      if (!pnlData.has(unit)) pnlData.set(unit, []);
      pnlData.get(unit).push({ hash:tx.hash, date, time:tx.time, tokenNet:tNet, adaNet });
    });
  });
}

// =================================================================
// ADDR FLOW — ADA and token flow between a labeled address and wallet
// =================================================================
export function calcAddrFlow(addr, allTxs) {
  let adaReceived = 0;
  let adaSent     = 0;
  const tokReceived = new Map();
  const tokSent     = new Map();
  let txCount = 0;

  allTxs.forEach(tx => {
    const addrInInputs  = (tx.inputs||[]).some(u => u.address === addr);
    const addrInOutputs = (tx.outputs||[]).some(u => u.address === addr);
    if (!addrInInputs && !addrInOutputs) return;
    txCount++;
    if (addrInInputs) {
      (tx.inputs||[]).filter(u => u.address === addr).forEach(u => {
        (u.amount||[]).forEach(a => {
          if (a.unit==='lovelace') adaReceived += parseInt(a.quantity);
          else tokReceived.set(a.unit, (tokReceived.get(a.unit)||0) + applyDecimals(a.quantity, a.unit));
        });
      });
    }
    if (addrInOutputs) {
      (tx.outputs||[]).filter(u => u.address === addr).forEach(u => {
        (u.amount||[]).forEach(a => {
          if (a.unit==='lovelace') adaSent += parseInt(a.quantity);
          else tokSent.set(a.unit, (tokSent.get(a.unit)||0) + applyDecimals(a.quantity, a.unit));
        });
      });
    }
  });

  return { txCount, adaReceived: adaReceived/1_000_000, adaSent: adaSent/1_000_000, tokReceived, tokSent };
}
