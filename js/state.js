// =================================================================
// STATE — shared across all modules. No imports.
// =================================================================

export const BASE    = 'https://cardano-mainnet.blockfrost.io/api/v0';
export const API_KEY = 'mainnettuskMeFpliyx52DukVDywVSJ9e5kUCqb';
export const PAGE_SIZE          = 25;
export const COLLAPSE_THRESHOLD = 5;
export const LABEL_COLORS       = ['accent','amber','blue','red'];

export const KNOWN_DECIMALS = {
  'f66d78b4a3cb3d37afa0ec36461e51ecbbd728c2a2d70354': 6, // DJED
  '8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd873': 6, // SHEN
  '25c5de5f5b286073c593edfd77b48abc7a48e5a4f3d4cd9d428ff935573696e': 6, // USDM
  '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6d696e': 6, // MIN
  '9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d77': 6, // SUNDAE
  '1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1': 6, // WMT
  'd894897411707efa755a76deb66d26dfd50593f2e70863e1661e98a': 6, // INDY
  'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235': 6, // iUSD
};
export const KNOWN_DECIMAL_POLICIES = new Set(Object.keys(KNOWN_DECIMALS));

// Transaction data
export let allTxs      = [];
export let myAddresses = new Set();
export let totalStakingRewards = 0;

export function setAllTxs(v)              { allTxs = v; }
export function setMyAddresses(v)         { myAddresses = v; }
export function setTotalStakingRewards(v) { totalStakingRewards = v; }

// Token decimals
export const tokenDecimals      = new Map();
export const userDecimalOverrides = new Set();

// Labels
export const labels = new Map();

// P&L
export const pnlData          = new Map();
export const pnlManualEntries = new Map();
export const pnlRemovedAuto   = new Map();

// Filter state
export let activeFilterUnit      = null;
export let lastFilterUnit        = null;
export let pnlTargetUnit         = null;
export let activeFilterWindow    = 3;
export let activeFilterAddr      = null;
export let lastFilterAddr        = null;
export let activeAddrFilterWindow = 3;

export function setActiveFilterUnit(v)       { activeFilterUnit = v; }
export function setLastFilterUnit(v)         { lastFilterUnit = v; }
export function setPnlTargetUnit(v)          { pnlTargetUnit = v; }
export function setActiveFilterWindow(v)     { activeFilterWindow = v; }
export function setActiveFilterAddr(v)       { activeFilterAddr = v; }
export function setLastFilterAddr(v)         { lastFilterAddr = v; }
export function setActiveAddrFilterWindow(v) { activeAddrFilterWindow = v; }

// Page counters — three independent counters, one per view state.
// getCurrentPage / setCurrentPage route to the right counter based
// on which filter (if any) is currently active.
export let pageUnfiltered  = 1;
export let pageTokenFilter = 1;
export let pageAddrFilter  = 1;

export function getCurrentPage() {
  if (activeFilterUnit) return pageTokenFilter;
  if (activeFilterAddr) return pageAddrFilter;
  return pageUnfiltered;
}
export function setCurrentPage(v) {
  if (activeFilterUnit) pageTokenFilter = v;
  else if (activeFilterAddr) pageAddrFilter = v;
  else pageUnfiltered = v;
}
export function resetPageCounters() {
  pageUnfiltered = 1;
  pageTokenFilter = 1;
  pageAddrFilter = 1;
}

// Label popup transient state
export let labelPopupAddr  = null;
export let labelPopupColor = 'accent';
export function setLabelPopupAddr(v)  { labelPopupAddr = v; }
export function setLabelPopupColor(v) { labelPopupColor = v; }
