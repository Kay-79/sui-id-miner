# Sui Vanity ID

**A high-performance CPU miner for finding various vanity Object IDs on the Sui blockchain.**

This project allows you to mine:
1.  **Package IDs**: Vanity addresses for your Move packages (e.g., `0xcafe...`).
2.  **Gas Coin IDs**: Split gas coins with specific IDs.
3.  **Move Call IDs**: Mine specific Object IDs resulting from Move calls (e.g., `sui::coin::create_currency` results).

## 📚 Documentation

**👉 [read the full User Guide (GUIDE.md)](GUIDE.md)** for detailed configuration and usage instructions.

## Features

-   **Multi-Mode Mining**: Supports Package ID, Gas Coin ID, and Generic Move Call ID mining.
-   **High Performance**: Multi-threaded CPU mining utilizing all available cores.
-   **100% On-Chain Verified**: Uses official `sui-types` logic to ensure accuracy.
-   **Web Interface**: Includes a Neo-Brutalism styled web UI for easy interaction.
-   **CLI Support**: Full command-line support for automation and headless operation.

---

## 🚀 Quick Start

### 1. CLI Usage
Build the tool and check the help menu:

```bash
cd cli
cargo build --release
./target/release/sui-vanity-id --help
```

See [GUIDE.md](GUIDE.md) for command examples.

### 2. Web Interface
Start the backend server and frontend app:

```bash
# Terminal 1 (Server)
cd cli && cargo run --release -- --server

# Terminal 2 (Frontend)
cd app && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Architecture

The project consists of two main parts:
-   **`cli/`**: Rust-based high-performance miner and WebSocket server.
-   **`app/`**: React/TypeScript frontend for user-friendly interaction.

## License

MIT
