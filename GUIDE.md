# User Guide - Sui ID Miner

This guide provides detailed instructions on how to configure and use the Sui ID Miner in both CLI and Web modes.

## 🖥️ CLI Usage

The CLI is the most powerful way to use the miner, supporting automation and headless operation.

### Common Arguments
These arguments apply to all commands or are frequently used:

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--prefix <HEX>` | The hex string you want to search for (e.g., `cafe`). Do not include `0x`. | `0` |
| `--rpc-url <URL>` | Sui RPC endpoint. | `https://fullnode.testnet.sui.io:443` |
| `--sender <ADDR>` | Your wallet address (sender of the transaction). | `0x0...01` |
| `--gas-object <ID>` | ID of the coin used to pay gas. | (Mock) |
| `--threads <N>` | Number of CPU threads to utilize. | All Cores |
| `--gas-budget <N>` | Gas budget for the transaction (MIST). | `100000000` |

---

### 1. Mining Package IDs (`package`)
Find a vanity address for your Move package (e.g., `0xcafe...`).

**Steps:**
1.  **Build your Move package**:
    ```bash
    sui move build
    ```
    This creates `.mv` files in `build/<PackageName>/bytecode_modules`.

2.  **Get a Gas Object**:
    Run `sui client gas` and pick a coin ID with enough balance.

3.  **Run the Miner**:
    ```bash
    cargo run --release -- package \
      --prefix <DESIRED_PREFIX> \
      --module ./build/<PackageName>/bytecode_modules \
      --sender <YOUR_ADDRESS> \
      --gas-object <GAS_COIN_ID>
    ```

4.  **Publish**:
    The miner outputs **Base64 Transaction Bytes**. Sign and execute them:
    ```bash
    sui client execute-signed-tx --tx-bytes <BYTES> --signatures <SIG>
    ```

---

### 2. Mining Gas Coin IDs (`gas`)
Split a gas coin into new coins that have vanity IDs.

**Example:**
Split a coin into two new coins, each with value 1 SUI (1,000,000,000 MIST), searching for prefix `aaaa`:

```bash
cargo run --release -- gas \
  --prefix aaaa \
  --split-amounts 1000000000,1000000000 \
  --sender <YOUR_ADDRESS> \
  --gas-object <GAS_COIN_ID>
```

---

### 3. Mining Move Call IDs (`move`)
Mine a vanity ID for an object created by *any* Move call (e.g., `coin::create_currency`).

**Steps:**
1.  **Construct the Transaction**:
    Use the Sui CLI or SDK to build your transaction bytes (but do not sign/execute yet).
    ```bash
    # Example: Build a move call transaction and get base64 bytes
    sui client call --package 0x2 ... --serialize-unsigned-transaction
    ```

2.  **Run the Miner**:
    ```bash
    cargo run --release -- move \
      --prefix <PREFIX> \
      --tx-base64 <BASE64_STRING> \
      --object-index 0
    ```
    *Note: `object-index` is usually 0 for the first object created.*

---

## 🌐 Web Interface Usage

For a visual experience, use the React-based Web UI.

### 1. Start the WebSocket Server
The web app needs a local server to handle the heavy CPU mining.

```bash
cd cli
cargo run --release -- --server
```
*   Server listens on `ws://localhost:9876`.
*   Leave this terminal running.

### 2. Launch the Web App
Open a new terminal:

```bash
cd app
npm install
npm run dev
```
*   Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Usage
1.  Click **Connect** in the top right to link to the WebSocket server.
2.  Select your desired **Mode** (Package, Gas, etc.).
3.  Fill in the form (Sender, Gas Object, etc.).
4.  Click **Start Mining**.
5.  Watch the progress bar! The app will notify you when a match is found.

## Performance Tuning
-   **Threads**: By default, the miner uses *all* available cores. If your system lags, reduce threads using `--threads 4`.
-   **Difficulty**: Each additional hex character increases difficulty by 16x.
    -   3 chars: Instant
    -   6 chars: Minutes/Hours
    -   8+ chars: Days/Weeks (depending on hardware)
