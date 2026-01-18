# Sui ID Miner - Web UI

> **Part of [Sui Package ID Miner](../README.md)** - High-performance vanity Package ID miner for Sui blockchain

A Neo-Brutalism styled web interface for mining Sui Package IDs.

## 📖 Quick Start

### 1. Start the Mining Server

```bash
cd sui-id-miner
cargo run --release -- --server
```

Server starts on `ws://localhost:9876`.

### 2. Run the Web App

```bash
cd sui-id-miner-web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

*Alternatively, you can use the hosted version:* **[sui-id-miner-web.vercel.app](https://sui-id-miner-web.vercel.app/)**

### 3. Connect & Mining

1. Click **"Connect"** to connect to the local server
2. Configure for Package ID mining
3. Click **"Start Mining"**

## 🛠️ Development

### Prerequisites
- Node.js 18+
- Rust 1.75+

### Project Structure
```
sui-id-miner-web/
├── src/
│   ├── components/       # UI Components
│   ├── hooks/            # useWebSocketMiner
│   └── App.tsx           # Main App
├── package.json
└── vite.config.ts
```

## ⚠️ Important Notes

1. **Gas Object**: For Package ID mining, the result depends on the exact gas object used. Use the same gas object when signing!

2. **Mining Time**: The longer the prefix, the longer it takes to mine:
   - 1 char: ~16^1 attempts
   - 2 chars: ~16^2 attempts
   - 4 chars: ~16^4 attempts
   - 6 chars: ~16^6 attempts

## 📄 License

MIT
