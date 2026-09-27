import { describe, expect, it, vi } from 'vitest';
import {
  fetchAddressBalances, fetchEthUsdPrice, fetchTopEthereumProtocols, isAddress, protocolsToColumns,
  rankEthereumProtocols, toCsv, weiHexToEth, type FetchLike, type LlamaProtocol,
} from '@/lib/ethereum-value';
import { analyzeLocal } from '@/lib/analysis-engine';

const PROTOCOLS: LlamaProtocol[] = [
  { name: 'Small', slug: 'small', category: 'Dexs', tvl: 10, chainTvls: { Ethereum: 5, Arbitrum: 5 }, change_7d: -3 },
  { name: 'Binance CEX', slug: 'binance-cex', category: 'CEX', tvl: 900, chainTvls: { Ethereum: 900 } },
  { name: 'Big', slug: 'big', category: 'Liquid Staking', tvl: 500, chainTvls: { Ethereum: 400, 'Ethereum-staking': 9999, Base: 100 }, change_1d: 1.5, chains: ['Ethereum', 'Base'] },
  { name: 'NoEth', slug: 'noeth', category: 'Lending', tvl: 1000, chainTvls: { Solana: 1000 } },
  { name: 'Zero', slug: 'zero', category: 'Lending', tvl: 0, chainTvls: { Ethereum: 0 } },
  { name: 'Mid', category: 'Lending', tvl: null, chainTvls: { Ethereum: 50 }, change_1d: NaN },
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('rankEthereumProtocols', () => {
  it('ranks by Ethereum TVL, excluding CEX, non-Ethereum and zero entries', () => {
    const rows = rankEthereumProtocols(PROTOCOLS);
    expect(rows.map(r => r.name)).toEqual(['Big', 'Mid', 'Small']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('uses only the plain Ethereum bucket, not staking/borrowed buckets', () => {
    const [big] = rankEthereumProtocols(PROTOCOLS);
    expect(big.ethereumTvlUsd).toBe(400);
    expect(big.totalTvlUsd).toBe(500);
    expect(big.ethereumSharePct).toBe(80);
    expect(big.chainCount).toBe(2);
    expect(big.change1dPct).toBe(1.5);
    expect(big.defillamaUrl).toBe('https://defillama.com/protocol/big');
  });

  it('handles missing tvl, slug and non-finite changes', () => {
    const mid = rankEthereumProtocols(PROTOCOLS)[1];
    expect(mid.totalTvlUsd).toBe(50);
    expect(mid.ethereumSharePct).toBe(100);
    expect(mid.change1dPct).toBeNull();
    expect(mid.defillamaUrl).toBeNull();
  });

  it('can include CEX wallets and apply a limit', () => {
    const rows = rankEthereumProtocols(PROTOCOLS, { excludeCategories: [], limit: 2 });
    expect(rows.map(r => r.name)).toEqual(['Binance CEX', 'Big']);
  });
});

describe('fetchTopEthereumProtocols', () => {
  it('fetches and ranks', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json(PROTOCOLS));
    const rows = await fetchTopEthereumProtocols({ limit: 1 }, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.llama.fi/protocols');
    expect(rows.map(r => r.name)).toEqual(['Big']);
  });

  it('throws on HTTP errors and unexpected shapes', async () => {
    await expect(fetchTopEthereumProtocols({}, async () => json({}, 500))).rejects.toThrow(/HTTP 500/);
    await expect(fetchTopEthereumProtocols({}, async () => json({ nope: 1 }))).rejects.toThrow(/shape/);
  });
});

describe('weiHexToEth', () => {
  it('converts wei hex to ETH', () => {
    expect(weiHexToEth('0x0')).toBe(0);
    expect(weiHexToEth('0xde0b6b3a7640000')).toBe(1);
  });

  it('keeps precision for very large balances', () => {
    const wei = 34_123_456_789_012n * 10n ** 12n;   // 34,123,456.789012 ETH
    expect(weiHexToEth('0x' + wei.toString(16))).toBe(34123456.789012);
  });
});

describe('fetchAddressBalances', () => {
  const A = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
  const B = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const EOA = '0x1111111111111111111111111111111111111111';

  it('batches balance + code calls and maps out-of-order responses by id', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json([
      { id: 5, result: '0x' },                              // EOA code
      { id: 1, result: '0x6080' },                          // A code
      { id: 0, result: '0x1bc16d674ec80000' },              // A: 2 ETH
      { id: 3, result: '0x6080' },                          // B code
      { id: 2, result: '0xde0b6b3a7640000' },               // B: 1 ETH
      { id: 4, result: '0x4563918244f40000' },              // EOA: 5 ETH
    ]));

    const rows = await fetchAddressBalances(
      [{ label: 'A', address: A }, { label: 'B', address: ` ${B} ` }, { label: 'E', address: EOA }, { label: 'bad', address: '0x123' }],
      'https://rpc.example', fetchImpl,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://rpc.example');
    const body = JSON.parse(String(init!.body));
    expect(body).toHaveLength(6);
    expect(body[0]).toMatchObject({ id: 0, method: 'eth_getBalance', params: [A.toLowerCase(), 'latest'] });
    expect(body[3]).toMatchObject({ id: 3, method: 'eth_getCode', params: [B.toLowerCase(), 'latest'] });

    expect(rows.map(r => [r.label, r.balanceEth, r.isContract])).toEqual([
      ['E', 5, false], ['A', 2, true], ['B', 1, true], ['bad', null, null],
    ]);
    expect(rows[3].error).toMatch(/valid/);
    expect(rows[2].address).toBe(B);
    expect(rows[1].etherscanUrl).toBe(`https://etherscan.io/address/${A}`);
  });

  it('surfaces per-item RPC errors', async () => {
    const rows = await fetchAddressBalances([{ label: 'A', address: A }], 'x', async () => json([
      { id: 0, error: { message: 'rate limited' } }, { id: 1, result: '0x60' },
    ]));
    expect(rows[0]).toMatchObject({ balanceEth: null, isContract: true, error: 'rate limited' });
  });

  it('rejects RPCs that do not support batching', async () => {
    await expect(fetchAddressBalances([{ label: 'A', address: A }], 'x', async () => json({ id: 0, result: '0x0' })))
      .rejects.toThrow(/batch/);
  });

  it('makes no request when there are no valid addresses', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const rows = await fetchAddressBalances([{ label: 'bad', address: 'nope' }], 'x', fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rows[0].error).toMatch(/valid/);
  });
});

describe('fetchEthUsdPrice', () => {
  it('reads the DefiLlama coins response', async () => {
    expect(await fetchEthUsdPrice(async () => json({ coins: { 'coingecko:ethereum': { price: 3456.78 } } }))).toBe(3456.78);
  });

  it('returns null instead of throwing', async () => {
    expect(await fetchEthUsdPrice(async () => json({}, 503))).toBeNull();
    expect(await fetchEthUsdPrice(async () => { throw new Error('offline'); })).toBeNull();
    expect(await fetchEthUsdPrice(async () => json({ coins: {} }))).toBeNull();
  });
});

describe('isAddress', () => {
  it('validates 20-byte hex addresses', () => {
    expect(isAddress('0x00000000219ab540356cBB839Cbe05303d7705Fa')).toBe(true);
    expect(isAddress('0x00000000219ab540356cBB839Cbe05303d7705F')).toBe(false);
    expect(isAddress('00000000219ab540356cBB839Cbe05303d7705Fa00')).toBe(false);
  });
});

describe('analyzer hand-off', () => {
  it('produces columns the local analyzer and CSV export accept', () => {
    const rows = rankEthereumProtocols(PROTOCOLS);
    const cols = protocolsToColumns(rows);
    expect(cols.every(c => c.values.length === rows.length)).toBe(true);
    expect(analyzeLocal(cols, rows.length).summary).toMatch(/3 rows × 7 columns/);

    const csv = toCsv(cols).split('\n');
    expect(csv[0]).toBe('rank,protocol,category,ethereum_tvl_usd,total_tvl_usd,ethereum_share_pct,change_7d_pct');
    expect(csv[1]).toBe('1,Big,Liquid Staking,400,500,80,');
  });

  it('quotes CSV fields containing commas, quotes and newlines', () => {
    expect(toCsv([{ name: 'n', type: 'categorical', values: ['a,b', 'say "hi"', 'x\ny'] }]))
      .toBe('n\n"a,b"\n"say ""hi"""\n"x\ny"');
  });
});
