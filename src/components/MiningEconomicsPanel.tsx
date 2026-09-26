import { useMemo, useState } from 'react';
import { Calculator, Zap } from 'lucide-react';
import { XMRIG_DEFAULT_DONATION, computeSession, qFromQuote, validateInputs, type MiningInputs } from '@/lib/mining-economics';

// Profit/loss for one measured mining session. Inputs are the operator's own
// measurements; the panel never supplies a hashrate, price or tariff.

type Field = { key: keyof MiningInputs; label: string; hint: string; percent?: boolean };

const FIELDS: Field[] = [
  { key: 'hashrate', label: 'Measured hashrate (H)', hint: 'Average while mining, e.g. MH/s from the miner API' },
  { key: 'revenuePerUnitHour', label: 'q — CAD per unit per hour', hint: 'Use the quote converter below' },
  { key: 'hours', label: 'Session length (t, hours)', hint: '' },
  { key: 'miningWatts', label: 'Wall power while mining (W)', hint: 'From a plug-in power meter' },
  { key: 'idleWatts', label: 'Wall power when idle (W)', hint: 'What the PC draws anyway' },
  { key: 'tariffCadPerKwh', label: 'Tariff (c, CAD/kWh)', hint: 'All-in rate from your bill' },
  { key: 'donationFraction', label: 'Miner donation (d, %)', hint: 'XMRig default is 1%', percent: true },
  { key: 'rejectFraction', label: 'Rejected/stale work (s, %)', hint: 'From pool stats', percent: true },
  { key: 'poolFeeFraction', label: 'Pool fee (p, %)', hint: "From the pool's fee page", percent: true },
  { key: 'payoutFeesCad', label: 'Payout/conversion fees (F, CAD)', hint: 'Share allocated to this session' },
];

const INITIAL: MiningInputs = {
  hashrate: 0, revenuePerUnitHour: 0, hours: 24,
  donationFraction: XMRIG_DEFAULT_DONATION, rejectFraction: 0, poolFeeFraction: 0,
  payoutFeesCad: 0, miningWatts: 0, idleWatts: 0, tariffCadPerKwh: 0,
};

const cad = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(v !== 0 && Math.abs(v) < 1 ? 4 : 2)}`;

export default function MiningEconomicsPanel() {
  const [inputs, setInputs] = useState<MiningInputs>(INITIAL);
  const [quote, setQuote] = useState({ revenue: 0, hashrate: 0, hours: 24, source: '' });
  const [quoteError, setQuoteError] = useState('');
  const [qSource, setQSource] = useState('');

  const errors = useMemo(() => validateInputs(inputs), [inputs]);
  const result = useMemo(() => (errors.length === 0 ? computeSession(inputs) : null), [inputs, errors]);
  const ready = inputs.hashrate > 0 && inputs.revenuePerUnitHour > 0;

  const set = (f: Field, raw: string) => {
    const n = raw === '' ? NaN : Number(raw);
    setInputs(prev => ({ ...prev, [f.key]: f.percent ? n / 100 : n }));
  };

  const applyQuote = () => {
    try {
      setInputs(prev => ({ ...prev, revenuePerUnitHour: qFromQuote(quote.revenue, quote.hashrate, quote.hours) }));
      setQSource(`${quote.source || 'unnamed source'} · ${new Date().toLocaleString()}`);
      setQuoteError('');
    } catch (e) {
      setQuoteError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-slate-300 leading-relaxed">
        Ethereum itself cannot be mined; it moved to proof-of-stake in September 2022. This calculator is for GPU/CPU
        coins such as Ravencoin (KAWPOW). It uses only your measured numbers, and q changes with coin price and
        network difficulty, so a result is only valid for the session it describes.
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 uppercase tracking-widest">
          <Calculator className="w-3.5 h-3.5" /> Session inputs
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {FIELDS.map(f => {
            const v = inputs[f.key];
            const shown = Number.isNaN(v) ? '' : f.percent ? +(v * 100).toFixed(6) : v;
            return (
              <label key={f.key} className="text-xs text-slate-400">
                {f.label}
                <input type="number" min={0} step="any" value={shown} onChange={e => set(f, e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" />
                {f.hint && <span className="text-[11px] text-slate-600">{f.hint}</span>}
              </label>
            );
          })}
        </div>
        {qSource && <p className="text-[11px] text-slate-500 mt-2">q source: {qSource}</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="text-xs text-slate-400 uppercase tracking-widest mb-3">Convert a quote to q</div>
        <p className="text-[11px] text-slate-500 mb-3">
          Calculators and pools quote "X CAD per day at Y hashrate". Enter that quote and its source.
        </p>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          {([['revenue', 'Quoted revenue (CAD)'], ['hashrate', 'At hashrate'], ['hours', 'Over hours']] as const).map(([k, label]) => (
            <label key={k} className="text-xs text-slate-400">
              {label}
              <input type="number" min={0} step="any" value={quote[k]}
                onChange={e => setQuote(q => ({ ...q, [k]: Number(e.target.value) }))}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" />
            </label>
          ))}
          <label className="text-xs text-slate-400">
            Source
            <input value={quote.source} onChange={e => setQuote(q => ({ ...q, source: e.target.value }))}
              placeholder="e.g. pool calculator"
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" />
          </label>
        </div>
        <button onClick={applyQuote} className="mt-3 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">
          Use as q
        </button>
        {quoteError && <span className="ml-3 text-red-400 text-xs">{quoteError}</span>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 uppercase tracking-widest">
          <Zap className="w-3.5 h-3.5" /> Session result
        </div>
        {errors.length > 0 && <ul className="text-red-400 text-xs space-y-1">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
        {result && !ready && <p className="text-xs text-slate-500">Enter a measured hashrate and q to see results.</p>}
        {result && ready && (
          <>
            <div className={`rounded border p-4 mb-4 ${result.profit >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <div className="text-xs text-slate-400">Session profit (R − F − E×c)</div>
              <div className={`text-2xl font-bold ${result.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{cad(result.profit)} CAD</div>
              <div className="text-xs text-slate-400 mt-1">
                {cad(result.profitPerHour)}/hour · {cad(result.profitPer30Days)} if this exact session repeated for 30 days
              </div>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <Row k="Gross theoretical revenue (G)" v={cad(result.grossRevenue)} />
              <Row k="Revenue after d, s, p (R)" v={cad(result.netRevenue)} />
              <Row k="Attributable energy (E)" v={`${result.energyKwh.toFixed(3)} kWh`} />
              <Row k="Energy cost (E×c)" v={cad(result.energyCost)} />
              <Row k="Payout/conversion fees (F)" v={cad(inputs.payoutFeesCad)} />
              <Row k="Break-even tariff" v={result.breakEvenTariff === null ? '—' : `${cad(result.breakEvenTariff)}/kWh`} />
              <Row k="Break-even q" v={result.breakEvenQ === null ? '—' : `${cad(result.breakEvenQ)} per unit-hour`} />
            </dl>
            {result.breakEvenTariff !== null && (
              <p className="text-xs text-slate-400 mt-4">
                {result.breakEvenTariff <= 0
                  ? 'Fees alone exceed revenue: this session loses money at any electricity price.'
                  : inputs.tariffCadPerKwh <= result.breakEvenTariff
                    ? `Profitable while electricity stays below ${cad(result.breakEvenTariff)}/kWh.`
                    : `Your tariff is above the ${cad(result.breakEvenTariff)}/kWh break-even, so mining costs more than it earns.`}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-800/50 py-1">
      <dt className="text-slate-400">{k}</dt><dd className="text-slate-200">{v}</dd>
    </div>
  );
}
