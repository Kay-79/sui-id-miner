mod cpu_miner;
mod progress;
mod server;
mod target;
mod types;

use anyhow::{Context, Result};
use base64::{Engine as _, engine::general_purpose};
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use sui_sdk::SuiClientBuilder;
use sui_types::{
    base_types::{ObjectDigest, ObjectID, SequenceNumber, SuiAddress},
    programmable_transaction_builder::ProgrammableTransactionBuilder,
    transaction::TransactionData,
};

use crate::cpu_miner::CpuMiner;
use crate::progress::ProgressDisplay;
use crate::target::TargetChecker;

/// Sui Package ID Miner - Find vanity package addresses
#[derive(Parser, Debug)]
#[command(name = "sui-id-miner")]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Hex prefix to search for (without 0x)
    #[arg(short, long, default_value = "0")]
    prefix: String,

    /// Number of CPU threads to use (default: all cores)
    #[arg(short, long)]
    threads: Option<usize>,

    /// Path to compiled Move module (.mv files directory or single file)
    #[arg(short, long)]
    module: Option<PathBuf>,

    /// Sender address
    #[arg(
        short,
        long,
        default_value = "0x0000000000000000000000000000000000000000000000000000000000000001"
    )]
    sender: String,

    /// Gas budget
    #[arg(long, default_value = "100000000")]
    gas_budget: u64,

    /// Gas price
    #[arg(long, default_value = "1000")]
    gas_price: u64,

    /// Gas object ID (coin to pay for transaction)
    #[arg(long)]
    gas_object: Option<String>,

    /// Sui RPC URL
    #[arg(long, default_value = "https://fullnode.testnet.sui.io:443")]
    rpc_url: String,

    /// Run benchmark for 10 seconds
    #[arg(long)]
    benchmark: bool,

    /// Export transaction template for Web Miner
    #[arg(long)]
    export_template: bool,

    /// Run as WebSocket server for Web App
    #[arg(long)]
    server: bool,

    /// Port for WebSocket server (default: 9876)
    #[arg(long, default_value = "9876")]
    port: u16,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Check if running in server mode
    if args.server {
        return server::run_server(args.port).await;
    }

    // Parse and validate prefix
    let prefix = args.prefix.trim_start_matches("0x");
    if !prefix.chars().all(|c| c.is_ascii_hexdigit()) {
        anyhow::bail!("Invalid prefix: must be hexadecimal characters only");
    }

    let target = TargetChecker::from_hex_prefix(prefix).context("Failed to parse prefix")?;

    println!("🚀 Sui Package ID Miner");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🎯 Target prefix: 0x{}", prefix);
    println!(
        "📊 Difficulty: {} hex chars (~{} attempts avg)",
        target.difficulty(),
        format_large_number(target.estimated_attempts())
    );

    // Load module bytes
    let module_bytes = load_module_bytes(&args.module)?;
    println!(
        "📦 Module bytes: {} bytes",
        module_bytes.iter().map(|m| m.len()).sum::<usize>()
    );

    // Parse sender
    let sender = SuiAddress::from_str(&args.sender).context("Invalid sender address")?;
    println!("👤 Sender: {}", sender);

    // Query gas object from RPC if provided
    let gas_payment = if let Some(gas_id) = &args.gas_object {
        println!("🔍 Querying gas object from {}...", args.rpc_url);
        let gas_ref = get_gas_object_ref(&args.rpc_url, gas_id).await?;
        println!(
            "✅ Gas object: {} (version: {}, digest: {})",
            gas_ref.0,
            gas_ref.1.value(),
            gas_ref.2
        );
        gas_ref
    } else {
        println!("⚠️  No gas object specified, using mock data");
        (
            ObjectID::from_str(
                "0x0000000000000000000000000000000000000000000000000000000000000000",
            )?,
            SequenceNumber::from_u64(0),
            ObjectDigest::new([0; 32]),
        )
    };

    // Create transaction template with salt placeholder
    let (tx_template, salt_offset) = create_tx_template(
        sender,
        module_bytes,
        args.gas_budget,
        args.gas_price,
        gas_payment,
    )?;
    println!(
        "📝 Transaction template: {} bytes (salt at offset {})",
        tx_template.len(),
        salt_offset
    );

    if args.export_template {
        println!("\n📤 Export for Web Miner:");
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!("TX_TEMPLATE_HEX={}", hex::encode(&tx_template));
        println!("NONCE_OFFSET={}", salt_offset);
        println!("BASE_GAS_BUDGET={}", args.gas_budget);
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return Ok(());
    }

    // Determine thread count
    let threads = args.threads.unwrap_or_else(num_cpus::get);
    println!("🧵 Threads: {}", threads);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Progress counter
    let total_attempts = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let cancel = Arc::new(AtomicBool::new(false));

    // Setup Ctrl+C handler
    let cancel_clone = cancel.clone();
    ctrlc::set_handler(move || {
        println!("\n⛔ Cancelled by user");
        cancel_clone.store(true, Ordering::SeqCst);
    })
    .ok();

    // Start progress display
    let progress = ProgressDisplay::new(target.estimated_attempts(), prefix);
    let progress_handle = {
        let cancel = cancel.clone();
        let total_attempts = total_attempts.clone();
        thread::spawn(move || {
            while !cancel.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(100));
                let attempts = total_attempts.load(Ordering::Relaxed);
                progress.update(attempts);
            }
        })
    };

    // Start mining
    println!("💻 Starting CPU mining with {} threads...\n", threads);
    let miner = CpuMiner::new(tx_template.clone(), salt_offset, target.clone(), threads);
    let result = miner.mine(total_attempts.clone(), cancel.clone());

    // Stop progress thread
    cancel.store(true, Ordering::SeqCst);
    let _ = progress_handle.join();

    // Handle result
    if let Some(result) = result {
        println!("\n");
        println!("🎉 ════════════════════════════════════════════════════════");
        println!("   FOUND MATCHING PACKAGE ID!");
        println!("════════════════════════════════════════════════════════════");
        println!();

        // Use proper hex formatting with leading zeros
        let id_hex = format!("0x{}", hex::encode(result.package_id.as_ref()));
        println!("📦 Package ID:        {}", id_hex);
        println!("📋 Transaction Digest: {}", result.tx_digest);
        println!(
            "🔢 Attempts:          {}",
            format_large_number(result.attempts)
        );
        println!("⛽ Gas Budget Used:   {}", result.gas_budget_used);
        println!();
        println!("📤 Transaction Bytes (Base64):");
        println!("────────────────────────────────────────────────────────────");
        println!("{}", general_purpose::STANDARD.encode(&result.tx_bytes));
        println!("────────────────────────────────────────────────────────────");
        println!();
        println!("💡 To use this transaction, sign and submit the base64 bytes above.");
        println!("════════════════════════════════════════════════════════════");
    } else {
        println!("\n❌ Mining cancelled without finding a match.");
    }

    Ok(())
}

fn load_module_bytes(path: &Option<PathBuf>) -> Result<Vec<Vec<u8>>> {
    match path {
        Some(p) if p.is_dir() => {
            // Load all .mv files from directory
            let mut modules = Vec::new();
            for entry in fs::read_dir(p)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "mv") {
                    modules.push(fs::read(&path)?);
                }
            }
            if modules.is_empty() {
                anyhow::bail!("No .mv files found in directory");
            }
            Ok(modules)
        }
        Some(p) if p.is_file() => {
            println!("📄 Loading module from: {}", p.display());
            let bytes = fs::read(p)?;
            println!("   Read {} bytes", bytes.len());
            Ok(vec![bytes])
        }
        Some(p) => {
            anyhow::bail!(
                "Path does not exist or is not a file/directory: {}",
                p.display()
            );
        }
        None => {
            // Use mock data for testing
            println!("⚠️  No module path specified, using mock data for testing");
            Ok(vec![vec![0u8; 100]]) // 100-byte mock module
        }
    }
}

fn create_tx_template(
    sender: SuiAddress,
    module_bytes: Vec<Vec<u8>>,
    base_gas_budget: u64,
    gas_price: u64,
    gas_payment: (ObjectID, SequenceNumber, ObjectDigest),
) -> Result<(Vec<u8>, usize)> {
    // Standard dependencies
    let dependencies = vec![ObjectID::from_str("0x1")?, ObjectID::from_str("0x2")?];

    // Build PTB (no salt input - we vary gas_budget instead)
    let mut ptb = ProgrammableTransactionBuilder::new();

    // Add publish command - returns UpgradeCap
    let upgrade_cap = ptb.publish_upgradeable(module_bytes, dependencies);

    // Transfer UpgradeCap to sender (required to consume the result)
    ptb.transfer_arg(sender, upgrade_cap);

    let pt = ptb.finish();

    // Use a placeholder gas_budget that we'll vary during mining
    // The nonce will be embedded in the lower bits of gas_budget
    let placeholder_gas_budget = 0xAAAAAAAAAAAAAAAAu64;

    // Create transaction data
    let tx_data = TransactionData::new_programmable(
        sender,
        vec![gas_payment],
        pt,
        placeholder_gas_budget,
        gas_price,
    );

    // Serialize
    let tx_bytes = bcs::to_bytes(&tx_data)?;

    // Find the gas_budget offset (look for our placeholder pattern)
    let placeholder_bytes = placeholder_gas_budget.to_le_bytes();
    let gas_budget_offset = find_pattern(&tx_bytes, &placeholder_bytes)
        .context("Could not find gas_budget placeholder in transaction bytes")?;

    // Replace placeholder with actual base gas budget in the template
    let mut tx_template = tx_bytes;
    tx_template[gas_budget_offset..gas_budget_offset + 8]
        .copy_from_slice(&base_gas_budget.to_le_bytes());

    Ok((tx_template, gas_budget_offset))
}

fn find_pattern(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn format_large_number(n: u64) -> String {
    if n >= 1_000_000_000_000 {
        format!("{:.2}T", n as f64 / 1_000_000_000_000.0)
    } else if n >= 1_000_000_000 {
        format!("{:.2}B", n as f64 / 1_000_000_000.0)
    } else if n >= 1_000_000 {
        format!("{:.2}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.2}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

async fn get_gas_object_ref(
    rpc_url: &str,
    object_id: &str,
) -> Result<(ObjectID, SequenceNumber, ObjectDigest)> {
    let sui_client = SuiClientBuilder::default()
        .build(rpc_url)
        .await
        .context("Failed to connect to Sui RPC")?;

    let object_id = ObjectID::from_str(object_id).context("Invalid gas object ID")?;

    let object = sui_client
        .read_api()
        .get_object_with_options(object_id, sui_sdk::rpc_types::SuiObjectDataOptions::new())
        .await
        .context("Failed to query gas object")?;

    let obj_ref = object
        .object_ref_if_exists()
        .context("Gas object not found on chain")?;

    Ok(obj_ref)
}
