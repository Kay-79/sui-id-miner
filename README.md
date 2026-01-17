# Sui Package ID Miner

A high-performance CPU miner for generating custom (vanity) Package IDs when publishing Move packages on the Sui blockchain.

## Features

-   **Vanity Package IDs**: Mine for specific hex prefixes (e.g., `0x00...`, `0xcafe...`).
-   **100% On-Chain Verified**: Uses the official `sui-types` SDK logic to ensure derived IDs match the Sui network exactly.
-   **Multi-threaded CPU Mining**: Utilizes all available CPU cores for maximum performance.
-   **Automatic Gas Management**: Automatically queries gas object details (version, digest) from the RPC.

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/sui-id-miner
cd sui-id-miner

# Build (Release mode recommended for performance)
cargo build --release
```

## Usage

### Step 1: Build your Move package

```bash
cd your-move-project
sui move build
```

This generates the bytecode modules in `build/YourPackage/bytecode_modules`.

### Step 2: Get a Gas Object ID

You need a gas coin to pay for the package publication. Get one from your wallet:

```bash
sui client gas
```

Copy the `gasCoinId` of a coin with sufficient balance (e.g., > 0.5 SUI).

### Step 3: Run the Miner

Use `cargo run --release` to start mining.

```bash
# Example: Find a Package ID starting with "0000"
cargo run --release -- \
  --prefix 0000 \
  --module ./build/YourPackage/bytecode_modules/ \
  --sender <YOUR_WALLET_ADDRESS> \
  --gas-object <GAS_COIN_ID>
```

**Options:**

| Option | Description | Default |
| :--- | :--- | :--- |
| `--prefix <HEX>` | Target hex prefix (without 0x) | `0` |
| `--module <PATH>` | Path to `.mv` files or directory | (Mock data) |
| `--sender <ADDRESS>` | Sender wallet address | `0x0...01` |
| `--gas-object <ID>` | Gas coin ID for payment | (Mock) |
| `--threads <N>` | Number of CPU threads | All cores |
| `--gas-budget <N>` | Gas budget in MIST | `100000000` |
| `--gas-price <N>` | Gas price in MIST | `1000` |
| `--rpc-url <URL>` | Sui RPC URL | `https://fullnode.testnet.sui.io:443` |

### Step 4: Publish the Package

When a match is found, the tool will output the **Transaction Bytes (Base64)** and the **Transaction Digest**.

You can sign and execute this transaction using the Sui CLI:

```bash
# 1. Sign the transaction bytes
sui keytool sign --address <YOUR_ADDRESS> --data <BASE64_TX_BYTES>

# 2. Execute the signed transaction
sui client execute-signed-tx --tx-bytes <BASE64_TX_BYTES> --signatures <SIGNATURE>
```

## Quick Start Example

Here is a complete, copy-pasteable example of the entire flow:

**1. Run the Miner**
```bash
cargo run --release -- \
  --prefix aaaa \
  --sender 0xe939815228fb9c0e0ad1f5b36b95cdd1347ce2c892c550f8a8a9b894c198e084 \
  --gas-object 0xd7fd074175196bbbed3dbfe688571273ca6efd5db74c328516a67dba9cc53447
```

**2. Copy the Output**
You will see output like this:
```text
🎉 FOUND MATCHING PACKAGE ID!
📦 Package ID:        0xaaaab267...
📋 Transaction Digest: E5Kd5RRu...

📤 Transaction Bytes (Base64):
────────────────────────────────────────────────────────────
AAABACDpOYFSKPucDgrR9bNrlc3RNHziyJLFUPioqbiUwZjghAIEAakDoRzrCwYAAAAKAQAIAggMAxQlBDkEBT0nB2RyCNYBQAqWAggMngJdDfsCAgAIAQcBCwEMAAAIAAECBAADAQIAAAMAAQAABQIBAAANAwQAAQYABgACCggBAQgCCwsBAQgDCQkKAAQHBQcBBwgCAAEHCAABBggAAQMCCAAIAAEIAQEIAAEJAAEGCAIBBQIJAAUHQ291bnRlcglUeENvbnRleHQDVUlEBmNyZWF0ZQJpZAlpbmNyZW1lbnQDbmV3Bm9iamVjdA5zZWNyZXRfY291bnRlcgZzZW5kZXIMc2hhcmVfb2JqZWN0CHRyYW5zZmVyCnR4X2NvbnRleHQFdmFsdWUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAICBAgBDQMAAQAABRIKABEDBgAAAAAAAAAAEgAMAgoAEQMGAAAAAAAAAAASAAwBCwI4AAsBCwAuEQY4AQIBAQAAAQkKABAAFAYBAAAAAAAAABYLAA8AFQICAQAAAQQLABAAFAIAAQACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEBAgAAAQAA6TmBUij7nA4K0fWza5XN0TR84siSxVD4qKm4lMGY4IQB1/0HQXUZa7vtPb/miFcSc8pu/V23TDKFFqZ9upzFNEdQsa4pAAAAACC92rjdIYmlkunAkMwyz1b8QM+jpeGlnAr1E7G9u3SV6uk5gVIo+5wOCtH1s2uVzdE0fOLIksVQ+KipuJTBmOCE6AMAAAAAAAA2KPcFAAAAAAA=
────────────────────────────────────────────────────────────
```

**3. Sign the Transaction**
Copy the long Base64 string above and sign it:
```bash
sui keytool sign \
  --address 0xe939815228fb9c0e0ad1f5b36b95cdd1347ce2c892c550f8a8a9b894c198e084 \
  --data AAABACDpOYFSKPucDgrR9bNrlc3RNHziyJLFUPioqbiUwZjghAIEAakDoRzrCwYAAAAKAQAIAggMAxQlBDkEBT0nB2RyCNYBQAqWAggMngJdDfsCAgAIAQcBCwEMAAAIAAECBAADAQIAAAMAAQAABQIBAAANAwQAAQYABgACCggBAQgCCwsBAQgDCQkKAAQHBQcBBwgCAAEHCAABBggAAQMCCAAIAAEIAQEIAAEJAAEGCAIBBQIJAAUHQ291bnRlcglUeENvbnRleHQDVUlEBmNyZWF0ZQJpZAlpbmNyZW1lbnQDbmV3Bm9iamVjdA5zZWNyZXRfY291bnRlcgZzZW5kZXIMc2hhcmVfb2JqZWN0CHRyYW5zZmVyCnR4X2NvbnRleHQFdmFsdWUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAICBAgBDQMAAQAABRIKABEDBgAAAAAAAAAAEgAMAgoAEQMGAAAAAAAAAAASAAwBCwI4AAsBCwAuEQY4AQIBAQAAAQkKABAAFAYBAAAAAAAAABYLAA8AFQICAQAAAQQLABAAFAIAAQACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEBAgAAAQAA6TmBUij7nA4K0fWza5XN0TR84siSxVD4qKm4lMGY4IQB1/0HQXUZa7vtPb/miFcSc8pu/V23TDKFFqZ9upzFNEdQsa4pAAAAACC92rjdIYmlkunAkMwyz1b8QM+jpeGlnAr1E7G9u3SV6uk5gVIo+5wOCtH1s2uVzdE0fOLIksVQ+KipuJTBmOCE6AMAAAAAAAA2KPcFAAAAAAA=
```

**4. Publish to Network**
Take the `suiSignature` from the previous command's output:
```bash
sui client execute-signed-tx \
  --tx-bytes AAABACDpOYFSKPucDgrR9bNrlc3RNHziyJLFUPioqbiUwZjghAIEAakDoRzrCwYAAAAKAQAIAggMAxQlBDkEBT0nB2RyCNYBQAqWAggMngJdDfsCAgAIAQcBCwEMAAAIAAECBAADAQIAAAMAAQAABQIBAAANAwQAAQYABgACCggBAQgCCwsBAQgDCQkKAAQHBQcBBwgCAAEHCAABBggAAQMCCAAIAAEIAQEIAAEJAAEGCAIBBQIJAAUHQ291bnRlcglUeENvbnRleHQDVUlEBmNyZWF0ZQJpZAlpbmNyZW1lbnQDbmV3Bm9iamVjdA5zZWNyZXRfY291bnRlcgZzZW5kZXIMc2hhcmVfb2JqZWN0CHRyYW5zZmVyCnR4X2NvbnRleHQFdmFsdWUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAICBAgBDQMAAQAABRIKABEDBgAAAAAAAAAAEgAMAgoAEQMGAAAAAAAAAAASAAwBCwI4AAsBCwAuEQY4AQIBAQAAAQkKABAAFAYBAAAAAAAAABYLAA8AFQICAQAAAQQLABAAFAIAAQACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEBAgAAAQAA6TmBUij7nA4K0fWza5XN0TR84siSxVD4qKm4lMGY4IQB1/0HQXUZa7vtPb/miFcSc8pu/V23TDKFFqZ9upzFNEdQsa4pAAAAACC92rjdIYmlkunAkMwyz1b8QM+jpeGlnAr1E7G9u3SV6uk5gVIo+5wOCtH1s2uVzdE0fOLIksVQ+KipuJTBmOCE6AMAAAAAAAA2KPcFAAAAAAA= \
  --signatures AON8rw95kOJuXodOXh7AlwtA03OOL+s9ymBqgXao6NmcsaW7eHwH8g/qYE0QDfqgm1ihep5lCy6YXAVY7tlCPwpjPHWMGkpumWgcWpUN/0WRmnUxBv9wLbbhRZms4znCEA==
```

## How It Works

1.  **Template Creation**: The tool creates a "Publish" transaction template using your module bytecode and gas object.
2.  **Variation**: It constantly varies the `Gas Budget` field in the transaction data. This changes the transaction digest without affecting the functionality (as long as the budget remains sufficient).
3.  **Hashing**: It computes `TransactionDigest = Blake2b256(Intent || BCS(TransactionData))`.
4.  **Derivation**: It derives the `PackageID` using `Sha3_256(TransactionDigest || Index)`.
    *   *Crucially, it strictly checks Index 0, which is where the Package ID is always located for publish transactions.*
5.  **Verification**: If the derived Package ID matches your prefix, it stops and reports the result.

## License

MIT
