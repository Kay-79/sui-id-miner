# 🚀 Sui Package ID Miner

<div align="center">

<!-- ![Sui ID Miner](./app/public/logo.svg) -->

**High-performance Vanity Package ID Miner for Sui Blockchain**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![Sui](https://img.shields.io/badge/Sui-Blockchain-blue.svg)](https://sui.io/)

[📖 CLI Documentation](./cli/README.md) • [🌐 Web UI Documentation](./app/README.md)

</div>

---

## 🎯 What is Sui Package ID Miner?

**Sui Package ID Miner** is the ultimate tool for generating **vanity Package IDs** when deploying Move smart contracts on the Sui blockchain. Create memorable, branded, or personalized package addresses like:

- `0x0000...` (leading zeros)
- `0xface...` (readable words)
- `0x1234...` (custom numbers)
- `0xcafe...` (branded prefixes)

### 🔥 Key Features

| Feature | Description |
|---------|-------------|
| ⚡ **Blazing Fast** | Multi-threaded CPU mining with ~1M+ hashes/sec |
| 🎨 **Custom Package IDs** | Choose your own prefix for Move package deployments |
| 🌐 **Web Interface** | Beautiful Neo-Brutalism UI for easy mining |
| 🖥️ **CLI Tool** | Powerful command-line interface for automation |

---

## 📦 Components

| Component | Description |
|-----------|-------------|
| **[CLI Miner](./cli/)** | High-performance Rust-based CPU miner |
| **[Web UI](./app/)** | Modern React frontend with Neo-Brutalism design |

## 🏃 Quick Start

### Option 1: CLI Only (For Developers)

```bash
# Clone the repository
git clone https://github.com/Kay-79/sui-id-miner.git
cd sui-id-miner/cli

# Build and run
cargo run --release -- \
  --prefix 0000 \
  --sender <YOUR_ADDRESS> \
  --gas-object <GAS_COIN_ID>
```

### Option 2: Web UI + Server (Recommended)

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

---

## ⚡ How It Works

Sui Package ID Miner uses a sophisticated brute-force algorithm:

1. **Template Creation** - Creates a "Publish" transaction template from Move bytecode
2. **Nonce Variation** - Varies transaction parameters to change the digest
3. **Hash Computation** - `TransactionDigest = Blake2b256(Intent || BCS(TransactionData))`
4. **ID Derivation** - `PackageID = Sha3_256(TransactionDigest || ObjectIndex)`
5. **Prefix Matching** - Checks if the derived Package ID matches your target prefix

---

## 🔧 Requirements

- **Rust** 1.75+ (for CLI)
- **Node.js** 18+ (for Web UI)
- **Sui Move Bytecode** (.mv files from `sui move build`)

---

## 📊 Performance

| Prefix Length | Combinations (16^L) | Estimated Time* | Difficulty |
|---------------|---------------------|-----------------|------------|
| 1 char | 16 | Instant | Very Easy |
| 2 chars | 256 | Instant | Very Easy |
| 3 chars | 4,096 | Instant | Very Easy |
| 4 chars | 65,536 | ~0.07 seconds | Easy |
| 5 chars | 1,048,576 | ~1 second | Easy |
| 6 chars | 16,777,216 | ~17 seconds | Medium |
| 7 chars | 268,435,456 | ~4.5 minutes | Medium |
| 8 chars | 4,294,967,296 | ~1.2 hours | Hard |
| 9 chars | 68,719,476,736 | ~19 hours | Very Hard |

*Times based on ~1M H/s. Formula: `Time = 16^L / Hashrate`

---

## 🔐 Security

- **Offline Mining**: All computation happens locally
- **No Private Keys Needed**: Package ID mining only requires your public address
- **Open Source**: Full source code available for audit

---

## 🌟 Use Cases

- **Branding**: Create memorable package IDs for your smart contracts
- **Protocol Identity**: Make your DeFi/NFT project stand out on block explorers
- **Recognizable Addresses**: Easy-to-remember package addresses for users

---

## 📚 Keywords

Sui Vanity Package ID, Sui Package Address Generator, Sui Smart Contract Address, Move Package ID Miner, Sui Custom Package ID, Sui Blockchain Vanity Generator, Sui Move Vanity Address

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - See [LICENSE](./LICENSE)

---

<div align="center">

**Built with ❤️ for the Sui Ecosystem**

⭐ Star this repo if you find it useful!

</div>
