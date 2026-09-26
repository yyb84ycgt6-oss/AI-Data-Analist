// ethereum-value.ts
// Where value sits on Ethereum, from public read-only sources:
//   - DefiLlama /protocols  → protocols ranked by TVL held on Ethereum
//   - any Ethereum JSON-RPC → live ETH balance + bytecode check for given addresses
//   - DefiLlama coins API   → ETH/USD for display
// Read-only: no wallet, no keys, no transactions.

import type { DataColumn } from './analysis-engine';

export const DEFILLAMA_PROTOCOLS_URL = 'https://api.llama.fi/protocols';
export const DEFILLAMA_ETH_PRICE_URL = 'https://coins.llama.fi/prices/current/coingecko:ethereum';
export const DEFAULT_RPC_URL = 'https://ethereum-rpc.publicnode.com';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

// ─── Protocol TVL ranking ──────────────────────────────────────────────────

export interface LlamaProtocol {
  name: string;
  slug?: string;
  category?: string;
  chains?: string[];
  tvl?: number | null;
  chainTvls?: Record<string, number>;
  change_1d?: number | null;
  change_7d?: number | null;
  url?: string;
}

export interface RankedProtocol {
  rank: number;
  name: string;
  category: string;
  ethereumTvlUsd: number;
  totalTvlUsd: number;
  ethereumSharePct: number;   // share of this protocol's TVL that is on Ethereum
  change1dPct: number | null; // total-TVL change reported by DefiLlama
  change7dPct: number | null;
  chainCount: number;
  defillamaUrl: string | null;
}

export interface RankOptions {
  limit?: number;
  excludeCategories?: string[];
}

// CEX entries track exchange wallets (mostly EOAs), not contract-held value.
export const DEFAULT_EXCLUDED_CATEGORIES = ['CEX'];

export function rankEthereumProtocols(protocols: LlamaProtocol[], opts: RankOptions = {}): RankedProtocol[] {
  const limit = opts.limit ?? 25;
  const excluded = new Set((opts.excludeCategories ?? DEFAULT_EXCLUDED_CATEGORIES).map(c => c.toLowerCase()));

  return protocols
    .filter(p => {
      const eth = p.chainTvls?.Ethereum;
      return typeof eth === 'number' && Number.isFinite(eth) && eth > 0
        && !excluded.has((p.category ?? '').toLowerCase());
    })
    .sort((a, b) => b.chainTvls!.Ethereum - a.chainTvls!.Ethereum)
    .slice(0, limit)
    .map((p, idx) => {
      const ethereumTvlUsd = p.chainTvls!.Ethereum;
      const totalTvlUsd = typeof p.tvl === 'number' && p.tvl > 0 ? p.tvl : ethereumTvlUsd;
      return {
        rank: idx + 1,
        name: p.name,
        category: p.category ?? 'Unknown',
        ethereumTvlUsd,
        totalTvlUsd,
        ethereumSharePct: Math.min(100, (ethereumTvlUsd / totalTvlUsd) * 100),
        change1dPct: finiteOrNull(p.change_1d),
        change7dPct: finiteOrNull(p.change_7d),
        chainCount: p.chains?.length ?? 1,
        defillamaUrl: p.slug ? `https://defillama.com/protocol/${p.slug}` : null,
      };
    });
}

export async function fetchTopEthereumProtocols(
  opts: RankOptions = {}, fetchImpl: FetchLike = defaultFetch,
): Promise<RankedProtocol[]> {
  const res = await fetchImpl(DEFILLAMA_PROTOCOLS_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`DefiLlama returned HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unexpected DefiLlama response shape');
  return rankEthereumProtocols(data as LlamaProtocol[], opts);
}

// ─── Live contract balances ────────────────────────────────────────────────

export interface WatchedAddress {
  label: string;
  address: string;
  note?: string;
}

// Starting points only — balances are read live, and labels should be checked on Etherscan.
export const SEED_CONTRACTS: WatchedAddress[] = [
  {
    label: 'Beacon Deposit Contract',
    address: '0x00000000219ab540356cBB839Cbe05303d7705Fa',
    note: 'Cumulative staking deposits; ETH is never withdrawn from this contract itself.',
  },
  { label: 'Wrapped Ether (WETH9)', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  { label: 'Arbitrum One: Bridge', address: '0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a' },
  { label: 'Base: OptimismPortal', address: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e' },
  { label: 'OP Mainnet: OptimismPortal', address: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed' },
];

export interface AddressBalance {
  label: string;
  address: string;
  note?: string;
  balanceEth: number | null;
  isContract: boolean | null;
  error?: string;
  etherscanUrl: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

// Exact integer division down to 1e-6 ETH, so large balances don't lose precision.
export function weiHexToEth(hex: string): number {
  const wei = BigInt(hex);
  return Number(wei / 10n ** 12n) / 1e6;
}

interface RpcResponse { id: number; result?: string; error?: { message?: string } }

export async function fetchAddressBalances(
  watched: WatchedAddress[], rpcUrl: string = DEFAULT_RPC_URL, fetchImpl: FetchLike = defaultFetch,
): Promise<AddressBalance[]> {
  const valid = watched.filter(w => isAddress(w.address));
  const invalid = watched.filter(w => !isAddress(w.address));

  const batch = valid.flatMap((w, idx) => [
    { jsonrpc: '2.0', id: idx * 2, method: 'eth_getBalance', params: [w.address.trim().toLowerCase(), 'latest'] },
    { jsonrpc: '2.0', id: idx * 2 + 1, method: 'eth_getCode', params: [w.address.trim().toLowerCase(), 'latest'] },
  ]);

  const byId = new Map<number, RpcResponse>();
  if (batch.length > 0) {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`RPC returned HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('RPC does not support batch requests');
    for (const item of data as RpcResponse[]) byId.set(item.id, item);
  }

  const results: AddressBalance[] = valid.map((w, idx) => {
    const bal = byId.get(idx * 2);
    const code = byId.get(idx * 2 + 1);
    const error = bal?.error?.message ?? code?.error?.message
      ?? (bal?.result === undefined ? 'No balance in RPC response' : undefined);
    return {
      label: w.label,
      address: w.address.trim(),
      note: w.note,
      balanceEth: bal?.result !== undefined ? weiHexToEth(bal.result) : null,
      isContract: code?.result !== undefined ? code.result !== '0x' : null,
      error,
      etherscanUrl: `https://etherscan.io/address/${w.address.trim()}`,
    };
  });

  for (const w of invalid) {
    results.push({
      label: w.label, address: w.address, note: w.note,
      balanceEth: null, isContract: null, error: 'Not a valid 0x address',
      etherscanUrl: `https://etherscan.io/address/${w.address}`,
    });
  }

  return results.sort((a, b) => (b.balanceEth ?? -1) - (a.balanceEth ?? -1));
}

export async function fetchEthUsdPrice(fetchImpl: FetchLike = defaultFetch): Promise<number | null> {
  try {
    const res = await fetchImpl(DEFILLAMA_ETH_PRICE_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.coins?.['coingecko:ethereum']?.price;
    return typeof price === 'number' && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

// ─── Hand-off to the analyzer / CSV ────────────────────────────────────────

export function protocolsToColumns(rows: RankedProtocol[]): DataColumn[] {
  return [
    { name: 'rank', type: 'numeric', values: rows.map(r => r.rank) },
    { name: 'protocol', type: 'categorical', values: rows.map(r => r.name) },
    { name: 'category', type: 'categorical', values: rows.map(r => r.category) },
    { name: 'ethereum_tvl_usd', type: 'numeric', values: rows.map(r => r.ethereumTvlUsd) },
    { name: 'total_tvl_usd', type: 'numeric', values: rows.map(r => r.totalTvlUsd) },
    { name: 'ethereum_share_pct', type: 'numeric', values: rows.map(r => r.ethereumSharePct) },
    { name: 'change_7d_pct', type: 'numeric', values: rows.map(r => r.change7dPct) },
  ];
}

export function toCsv(columns: DataColumn[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rowCount = columns[0]?.values.length ?? 0;
  const lines = [columns.map(c => escape(c.name)).join(',')];
  for (let i = 0; i < rowCount; i++) lines.push(columns.map(c => escape(c.values[i])).join(','));
  return lines.join('\n');
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
