<div align="center">

<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

  <h1>Built with AI Studio</h2>

  <p>The fastest path from prompt to production with Gemini.</p>

  <a href="https://aistudio.google.com/apps">Start building</a>

</div>

## Desktop icon (Windows)

1. Install [Node.js](https://nodejs.org) 18 or newer (LTS), or run `winget install OpenJS.NodeJS.LTS`.
2. Get this project onto your PC, e.g. `git clone https://github.com/yyb84ycgt6-oss/AI-Data-Analist.git`.
3. Double-click **`Create Desktop Icon.cmd`** in the project folder once. An **Ethereum Contracting Hub** icon appears on your desktop.
4. Double-click the icon. The first start installs dependencies (about a minute), then the hub opens in your browser on the Ethereum Value tab at `http://127.0.0.1:5317/#ethereum`.

The icon runs `launcher/Start-Hub.ps1`, which serves the app only to this PC (`127.0.0.1`) from a console window. Close that window to stop the hub; double-clicking the icon while it is already running just opens another browser tab. To remove the icon, delete it from the desktop. If you downloaded the project as a ZIP instead of cloning it, right-click the ZIP, choose **Properties**, tick **Unblock** and click **OK** before extracting, or Windows may warn about the scripts.

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
