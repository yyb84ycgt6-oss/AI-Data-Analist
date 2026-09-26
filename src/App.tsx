import { useState, useCallback } from 'react';
import { BarChart2, Upload, Brain, TrendingUp, AlertTriangle, CheckCircle2, Loader2, Database, Calculator } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { analyzeDataset, suggestCharts, type DataColumn, type AnalysisResult, type ChartSpec } from '@/lib/analysis-engine';
import EthereumValuePanel from '@/components/EthereumValuePanel';
import MiningEconomicsPanel from '@/components/MiningEconomicsPanel';

// AI Data Analyst — ⚸ Analysis Condenser
// Offline-first: drag-drop CSV/JSON, local stats, AI-enhanced when Jacky/Ollama running
// Future-proof: papaparse for CSV, JSON.parse for JSON, Recharts for viz

function parseCSV(text: string): { columns: DataColumn[]; rowCount: number } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { columns: [], rowCount: 0 };
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/"/g, '')));

  const columns: DataColumn[] = headers.map((name, i) => {
    const values = rows.map(r => r[i] ?? null);
    const numericVals = values.map(v => Number(v));
    const isNumeric = values.every(v => v === null || v === '' || !isNaN(Number(v)));
    return {
      name,
      type: isNumeric ? 'numeric' : 'categorical',
      values: isNumeric ? numericVals : values,
    };
  });

  return { columns, rowCount: rows.length };
}

function parseJSON(text: string): { columns: DataColumn[]; rowCount: number } {
  try {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) return { columns: [], rowCount: 0 };
    const keys = Object.keys(rows[0]);
    const columns: DataColumn[] = keys.map(name => {
      const values = rows.map(r => r[name] ?? null);
      const isNumeric = values.every(v => v === null || typeof v === 'number');
      return { name, type: isNumeric ? 'numeric' : 'categorical', values };
    });
    return { columns, rowCount: rows.length };
  } catch { return { columns: [], rowCount: 0 }; }
}

function ChartRenderer({ spec }: { spec: ChartSpec }) {
  if (spec.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={spec.data as any[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey={spec.xKey} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
          <Bar dataKey={spec.yKey || 'count'} fill="#3b82f6" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (spec.type === 'scatter' && spec.yKey) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey={spec.xKey} name={spec.xKey} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis dataKey={spec.yKey} name={spec.yKey} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
          <Scatter data={spec.data as any[]} fill="#3b82f6" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={spec.data as any[]}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
        <Bar dataKey="value" fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

type Tab = 'analyst' | 'ethereum' | 'mining';

const TABS: { id: Tab; label: string; Icon: typeof BarChart2 }[] = [
  { id: 'analyst', label: 'Data Analyst', Icon: BarChart2 },
  { id: 'ethereum', label: 'Ethereum Value', Icon: Database },
  { id: 'mining', label: 'Mining Economics', Icon: Calculator },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('analyst');
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const runAnalysis = useCallback(async (parsed: { columns: DataColumn[]; rowCount: number }, name: string) => {
    setError(''); setResult(null); setCharts([]);
    setFileName(name);

    if (parsed.columns.length === 0) {
      setError('Could not parse file. Ensure it is a valid CSV or JSON array.');
      return;
    }

    setColumns(parsed.columns);
    setRowCount(parsed.rowCount);
    setLoading(true);

    try {
      const [analysis, chartSpecs] = await Promise.all([
        analyzeDataset(parsed.columns, parsed.rowCount),
        Promise.resolve(suggestCharts(parsed.columns)),
      ]);
      setResult(analysis);
      setCharts(chartSpecs);
    } catch (e) {
      setError('Analysis failed. Check console for details.');
    } finally {
      setLoading(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    const text = await file.text();
    await runAnalysis(file.name.endsWith('.json') ? parseJSON(text) : parseCSV(text), file.name);
  }, [runAnalysis]);

  const analyzeExternal = useCallback((cols: DataColumn[], count: number, name: string) => {
    setTab('analyst');
    runAnalysis({ columns: cols, rowCount: count }, name);
  }, [runAnalysis]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart2 className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold tracking-wide">AI Data Analyst</h1>
            <span className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-400">⚸ Analysis Condenser</span>
          </div>
          <p className="text-xs text-slate-500">Offline-first · Jacky-ready · Ollama-ready · Drop CSV or JSON</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition-colors ${
                  tab === id ? 'border-blue-500/60 bg-blue-500/10 text-blue-300' : 'border-slate-800 text-slate-400 hover:text-slate-200'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Kept mounted so fetched data and inputs survive tab switches */}
        <div className={tab === 'ethereum' ? '' : 'hidden'}><EthereumValuePanel onAnalyze={analyzeExternal} /></div>
        <div className={tab === 'mining' ? '' : 'hidden'}><MiningEconomicsPanel /></div>

        {tab === 'analyst' && (<>

        {/* Drop zone */}
        {!fileName && (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center hover:border-blue-500/50 transition-colors cursor-pointer mb-6"
          >
            <label className="cursor-pointer block">
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 text-sm mb-1">Drop a CSV or JSON file here</p>
              <p className="text-slate-600 text-xs">or click to browse</p>
              <input type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}

        {fileName && !loading && (
          <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            {fileName} — {rowCount} rows × {columns.length} cols
            <button onClick={() => { setFileName(''); setResult(null); setCharts([]); setColumns([]); }}
              className="ml-2 text-slate-600 hover:text-slate-400 underline">Reset</button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyzing with AI...
          </div>
        )}

        {error && <div className="text-red-400 text-xs mb-4 p-3 rounded border border-red-500/20 bg-red-500/5">{error}</div>}

        {result && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-400 uppercase tracking-widest">
                <Brain className="w-3.5 h-3.5" /> Summary
              </div>
              <p className="text-sm text-slate-200">{result.summary}</p>
            </div>

            {/* Insights + Patterns + Anomalies */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Insights
                </div>
                <ul className="space-y-1.5">
                  {result.insights.map((i, idx) => (
                    <li key={idx} className="text-xs text-slate-300">• {i}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest mb-3">Patterns</div>
                {result.patterns.length > 0
                  ? result.patterns.map((p, idx) => <div key={idx} className="text-xs text-slate-300 mb-1">• {p}</div>)
                  : <div className="text-xs text-slate-500">No strong patterns detected</div>}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> Anomalies
                </div>
                {result.anomalies.length > 0
                  ? result.anomalies.map((a, idx) => <div key={idx} className="text-xs text-amber-300 mb-1">⚠ {a}</div>)
                  : <div className="text-xs text-slate-500">No anomalies detected</div>}
              </div>
            </div>

            {/* Recommendation */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="text-xs text-blue-400 uppercase tracking-widest mb-2">Recommendation</div>
              <p className="text-sm text-slate-200">{result.recommendation}</p>
            </div>

            {/* Charts */}
            {charts.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {charts.map((chart, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-xs text-slate-400 mb-3">{chart.title}</div>
                    <ChartRenderer spec={chart} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
