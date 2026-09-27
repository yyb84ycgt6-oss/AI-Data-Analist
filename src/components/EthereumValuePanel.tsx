import { useState } from 'react';
import { Database, Download, ExternalLink, Loader2, Wallet, BarChart2 } from 'lucide-react';
import {
  DEFAULT_RPC_URL, SEED_CONTRACTS, fetchAddressBalances, fetchEthUsdPrice, fetchTopEthereumProtocols,
  protocolsToColumns, toCsv, type AddressBalance, type RankedProtocol, type WatchedAddress,
} from '@/lib/ethereum-value';
import type { DataColumn } from '@/lib/analysis-engine';

// Read-only view of where value is held on Ethereum.
// Protocol TVL comes from DefiLlama; contract ETH balances come straight from an RPC node.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const eth = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function pct(v: number | null) {
  if (v === null) return <span className="text-slate-600">—</span>;
  return <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>;
}

function parseWatchList(text: string): WatchedAddress[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const idx = line.lastIndexOf(',');
    return idx === -1
      ? { label: line, address: line }
      : { label: line.slice(0, idx).trim(), address: line.slice(idx + 1).trim() };
  });
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

export default function EthereumValuePanel({ onAnalyze }: {
  onAnalyze: (columns: DataColumn[], rowCount: number, name: string) => void;
}) {
  const [limit, setLimit] = useState(25);
  const [includeCex, setIncludeCex] = useState(false);
  const [protocols, setProtocols] = useState<RankedProtocol[]>([]);
  const [protocolsAt, setProtocolsAt] = useState<Date | null>(null);
  const [protocolsLoading, setProtocolsLoading] = useState(false);
  const [protocolsError, setProtocolsError] = useState('');

  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [watchText, setWatchText] = useState(SEED_CONTRACTS.map(c => `${c.label}, ${c.address}`).join('\n'));
  const [balances, setBalances] = useState<AddressBalance[]>([]);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState('');

  const loadProtocols = async () => {
    setProtocolsLoading(true); setProtocolsError('');
    try {
      setProtocols(await fetchTopEthereumProtocols({ limit, excludeCategories: includeCex ? [] : undefined }));
      setProtocolsAt(new Date());
    } catch (e) {
      setProtocolsError(`Could not load DefiLlama data: ${(e as Error).message}`);
    } finally {
      setProtocolsLoading(false);
    }
  };

  const loadBalances = async () => {
    setBalancesLoading(true); setBalancesError('');
    try {
      const seedNotes = new Map(SEED_CONTRACTS.map(c => [c.address.toLowerCase(), c.note]));
      const watched = parseWatchList(watchText).map(w => ({ ...w, note: seedNotes.get(w.address.toLowerCase()) }));
      const [rows, price] = await Promise.all([fetchAddressBalances(watched, rpcUrl), fetchEthUsdPrice()]);
      setBalances(rows); setEthUsd(price);
    } catch (e) {
      setBalancesError(`Could not read balances: ${(e as Error).message}`);
    } finally {
      setBalancesLoading(false);
    }
  };

  const stamp = protocolsAt ? protocolsAt.toISOString().slice(0, 16).replace(':', '') : '';

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400 leading-relaxed">
        Read-only market data. Knowing where value is locked does not produce returns by itself, and nothing here
        connects a wallet or sends a transaction.
      </div>

      {/* Protocol TVL */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-widest">
            <Database className="w-3.5 h-3.5" /> Top protocols by value held on Ethereum
          </div>
          <div className="flex items-center gap-3 ml-auto text-xs">
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1">
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-slate-400">
              <input type="checkbox" checked={includeCex} onChange={e => setIncludeCex(e.target.checked)} />
              include CEX wallets
            </label>
            <button onClick={loadProtocols} disabled={protocolsLoading}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">
              {protocolsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Fetch'}
            </button>
          </div>
        </div>

        {protocolsError && <div className="text-red-400 text-xs mb-3">{protocolsError}</div>}

        {protocols.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
              <span>Source: DefiLlama · fetched {protocolsAt?.toLocaleString()}</span>
              <button onClick={() => onAnalyze(protocolsToColumns(protocols), protocols.length, `ethereum-top-${protocols.length}-protocols`)}
                className="ml-auto flex items-center gap-1 text-blue-400 hover:text-blue-300">
                <BarChart2 className="w-3.5 h-3.5" /> Analyze in Data Analyst
              </button>
              <button onClick={() => downloadText(`ethereum-top-protocols-${stamp}.csv`, toCsv(protocolsToColumns(protocols)))}
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 text-left">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-3">#</th><th className="pr-3">Protocol</th><th className="pr-3">Category</th>
                    <th className="pr-3 text-right">Ethereum TVL</th><th className="pr-3 text-right">Total TVL</th>
                    <th className="pr-3 text-right">On ETH</th><th className="pr-3 text-right">1d</th><th className="text-right">7d</th>
                  </tr>
                </thead>
                <tbody>
                  {protocols.map(p => (
                    <tr key={p.rank} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-3 text-slate-500">{p.rank}</td>
                      <td className="pr-3">
                        {p.defillamaUrl
                          ? <a href={p.defillamaUrl} target="_blank" rel="noreferrer" className="hover:text-blue-300">{p.name}</a>
                          : p.name}
                      </td>
                      <td className="pr-3 text-slate-400">{p.category}</td>
                      <td className="pr-3 text-right">{usd.format(p.ethereumTvlUsd)}</td>
                      <td className="pr-3 text-right text-slate-400">{usd.format(p.totalTvlUsd)}</td>
                      <td className="pr-3 text-right text-slate-400">{p.ethereumSharePct.toFixed(0)}%</td>
                      <td className="pr-3 text-right">{pct(p.change1dPct)}</td>
                      <td className="text-right">{pct(p.change7dPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-600 mt-3">
              TVL excludes staking/borrowed/pool2 buckets. Liquid staking and restaking protocols can hold the same ETH, so
              summing rows double-counts. 1d/7d changes are for each protocol's total TVL.
            </p>
          </>
        )}
      </section>

      {/* Live balances */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 uppercase tracking-widest">
          <Wallet className="w-3.5 h-3.5" /> Live ETH balance of specific contracts
        </div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <label className="text-xs text-slate-500 md:col-span-3">
            RPC endpoint (any Ethereum mainnet JSON-RPC that allows browser requests)
            <input value={rpcUrl} onChange={e => setRpcUrl(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" />
          </label>
          <label className="text-xs text-slate-500 md:col-span-3">
            One per line: <span className="text-slate-400">label, 0xaddress</span>
            <textarea value={watchText} onChange={e => setWatchText(e.target.value)} rows={5}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono" />
          </label>
        </div>
        <button onClick={loadBalances} disabled={balancesLoading}
          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs mb-3">
          {balancesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Read balances'}
        </button>

        {balancesError && <div className="text-red-400 text-xs mb-3">{balancesError}</div>}

        {balances.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 text-left">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-3">Label</th><th className="pr-3">Address</th>
                  <th className="pr-3 text-right">ETH</th><th className="pr-3 text-right">USD</th><th>Contract?</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(b => (
                  <tr key={b.address + b.label} className="border-b border-slate-800/50 align-top">
                    <td className="py-1.5 pr-3">
                      {b.label}
                      {b.note && <div className="text-[11px] text-slate-500">{b.note}</div>}
                      {b.error && <div className="text-[11px] text-red-400">{b.error}</div>}
                    </td>
                    <td className="pr-3">
                      <a href={b.etherscanUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-slate-400 hover:text-blue-300">
                        {b.address.slice(0, 8)}…{b.address.slice(-6)} <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="pr-3 text-right">{b.balanceEth === null ? '—' : eth.format(b.balanceEth)}</td>
                    <td className="pr-3 text-right text-slate-400">
                      {b.balanceEth === null || ethUsd === null ? '—' : usd.format(b.balanceEth * ethUsd)}
                    </td>
                    <td className={b.isContract === false ? 'text-amber-400' : 'text-slate-400'}>
                      {b.isContract === null ? '—' : b.isContract ? 'yes' : 'no (EOA)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-600 mt-3">
              Native ETH only; token holdings (USDC, stETH, …) show up in the TVL table instead. Seed labels are a starting
              point, so check each on Etherscan. {ethUsd !== null && `ETH/USD ${ethUsd.toFixed(2)} via DefiLlama.`}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
