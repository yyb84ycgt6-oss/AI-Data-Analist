<div align="center">

<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

  <h1>Built with AI Studio</h2>

  <p>The fastest path from prompt to production with Gemini.</p>

  <a href="https://aistudio.google.com/apps">Start building</a>

</div>

## Running locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests (vitest)
npm run build   # typecheck + production build
```

The app has three tabs:

- **Data Analyst**: drop a CSV/JSON file for local stats, trends, anomalies and charts (AI insights when Jacky/Ollama is running).
- **Ethereum Value**: a read-only view of where value sits on Ethereum.
  - Protocols ranked by TVL held on Ethereum, from the public [DefiLlama API](https://api.llama.fi/protocols) (CEX wallets excluded by default). Export to CSV or send straight to the Data Analyst tab.
  - Live native-ETH balances and a contract/EOA check for any list of addresses, read from a JSON-RPC endpoint you choose (default `ethereum-rpc.publicnode.com`).
  - No wallet, keys or transactions are involved.
- **Mining Economics**: session profit/loss from *your measured* hashrate and wall power.
  `G = H·q·t`, `R = G·(1−d)(1−s)(1−p)`, `E = (W_mining − W_idle)·t/1000`, `profit = R − F − E·c`,
  plus break-even tariff and break-even `q`. It never supplies a hashrate, price or tariff for you.
  Ethereum itself can't be mined (proof-of-stake since September 2022).
