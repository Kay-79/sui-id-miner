# 🚀 Sui Package ID Miner

<div align="center">

**High-performance vanity Package ID miner for Sui blockchain**

[CLI Documentation](./cli/README.md) • [Web UI Documentation](./app/README.md)

</div>

---

## ✨ Overview

Sui Package ID Miner is a tool for mining custom (vanity) Package IDs when publishing Move packages on the Sui blockchain. It consists of two components:

| Component | Description |
|-----------|-------------|
| **[CLI](./cli/)** | High-performance Rust-based CPU miner |
| **[Web UI](./app/)** | Neo-Brutalism styled React frontend |

## 📦 Project Structure

```
sui-id-miner/
├── cli/                    # Rust CLI miner
│   ├── src/               # Core mining logic
│   ├── bytecode_modules/  # Sample Move modules
│   └── Cargo.toml         # Rust dependencies
├── app/                    # React Web UI
│   ├── src/               # React components
│   └── package.json       # Node dependencies
└── LICENSE                # MIT License
```

## 🏃 Quick Start

### Option 1: CLI Only

```bash
cd cli
cargo run --release -- \
  --prefix 0000 \
  --sender <YOUR_ADDRESS> \
  --gas-object <GAS_COIN_ID>
```

### Option 2: Web UI + Server

**Terminal 1 - Start Mining Server:**
```bash
cd cli
cargo run --release -- --server
```

**Terminal 2 - Start Web App:**
```bash
cd app
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🔧 Requirements

- **Rust** 1.75+ (for CLI)
- **Node.js** 18+ (for Web UI)

## 📚 Documentation

For detailed usage instructions:

- **CLI**: See [cli/README.md](./cli/README.md)
- **Web UI**: See [app/README.md](./app/README.md)

## ⚡ How It Works

1. **Template Creation** - Creates a "Publish" transaction template using module bytecode
2. **Variation** - Varies the Gas Budget field to change the transaction digest
3. **Hashing** - Computes `TransactionDigest = Blake2b256(Intent || BCS(TransactionData))`
4. **Derivation** - Derives PackageID using `Sha3_256(TransactionDigest || Index)`
5. **Verification** - Checks if derived Package ID matches your target prefix

## 📄 License

MIT - See [LICENSE](./LICENSE)
