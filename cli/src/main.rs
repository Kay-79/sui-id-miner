mod common;
mod mining;
mod module_order;
mod progress;
mod server;
mod target;

use crate::common::{
    create_split_tx_template, create_template_from_bytes, create_tx_template, format_large_number,
    randomize_gas_budget,
};
use crate::mining::{CpuExecutor, GasCoinMode, MinerConfig, MinerExecutor, PackageMode, SingleObjectMode};
use crate::module_order::sort_modules_by_dependency;
use crate::progress::ProgressDisplay;
use crate::target::TargetChecker;
use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use clap::{Parser, Subcommand};
use rand::rngs::OsRng;
use rand::Rng;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use sui_sdk::SuiClientBuilder;
use sui_types::base_types::{ObjectDigest, ObjectID, SequenceNumber, SuiAddress};

#[derive(Parser, Debug)]
#[command(name = "sui-id-miner")]
#[command(author, version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Run as WebSocket server for Web App
    #[arg(long, global = true)]
    server: bool,

    /// Port for WebSocket server (default: 9876)
    #[arg(long, default_value = "9876", global = true)]
    port: u16,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Mine for a Package ID (vanity address for Move package)
    Package {
        /// Hex prefix to search for (without 0x)
        #[arg(short, long)]
        prefix: String,

        /// Path to compiled Move module (.mv files directory or single file)
        #[arg(short, long)]
        module: Option<PathBuf>,

        /// Sender address
        #[arg(short, long)]
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

        /// Number of CPU threads to use (default: all cores)
        #[arg(short, long)]
        threads: Option<usize>,

        /// Export transaction template for Web Miner
        #[arg(long)]
        export_template: bool,
    },
    /// Mine for Gas Coin IDs (split gas coin)
    Gas {
        /// Hex prefix to search for (without 0x)
        #[arg(short, long)]
        prefix: String,

        /// Split amounts (comma separated, e.g. 1000000,1000000)
        #[arg(short, long, value_delimiter = ',', num_args = 1..)]
        split_amounts: Vec<u64>,

        /// Sender address
        #[arg(short, long)]
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

        /// Number of CPU threads to use (default: all cores)
        #[arg(short, long)]
        threads: Option<usize>,
    },
    /// Mine for a Move Call result ID (generic)
    Move {
        /// Hex prefix to search for (without 0x)
        #[arg(short, long)]
        prefix: String,

        /// Base64 encoded transaction bytes
        #[arg(long)]
        tx_base64: String,

        /// Object index to check (default: 0)
        #[arg(long, default_value = "0")]
        object_index: u16,

        /// Number of CPU threads to use (default: all cores)
        #[arg(short, long)]
        threads: Option<usize>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // SERVER MODE
    if args.server {
        // In server mode, we don't need subcommands.
        // We can optionally load default modules if provided as a fallback/convenience,
        // but since we moved `module` into the `Package` subcommand, we might just skip it for now
        // or allow passing it via environment variables or a specific config if needed.
        // For now, let's just run the server without default modules loaded from CLI args.
        return server::run_server(args.port, None).await;
    }

    match args.command {
        Some(Commands::Package {
            prefix,
            module,
            sender,
            gas_budget,
            gas_price,
            gas_object,
            rpc_url,
            threads,
            export_template,
        }) => {
            run_package_mining(
                prefix,
                module,
                sender,
                gas_budget,
                gas_price,
                gas_object,
                rpc_url,
                threads,
                export_template,
            )
            .await
        }
        Some(Commands::Gas {
            prefix,
            split_amounts,
            sender,
            gas_budget,
            gas_price,
            gas_object,
            rpc_url,
            threads,
        }) => {
            run_gas_mining(
                prefix,
                split_amounts,
                sender,
                gas_budget,
                gas_price,
                gas_object,
                rpc_url,
                threads,
            )
            .await
        }
        Some(Commands::Move {
            prefix,
            tx_base64,
            object_index,
            threads,
        }) => run_move_mining(prefix, tx_base64, object_index, threads).await,
        None => {
            // Default behavior if no subcommand is provided (and not server mode)
            // Print help
            use clap::CommandFactory;
            Args::command().print_help()?;
            Ok(())
        }
    }
}

async fn run_package_mining(
    prefix: String,
    module_path: Option<PathBuf>,
    sender_str: String,
    gas_budget: u64,
    gas_price: u64,
    gas_object_str: Option<String>,
    rpc_url: String,
    threads_opt: Option<usize>,
    export_template: bool,
) -> Result<()> {
    // Parse and validate prefix
    let prefix = prefix.trim_start_matches("0x");
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
    let raw_modules = load_module_bytes(&module_path)?;
    println!(
        "📦 Loaded {} module(s), {} bytes total",
        raw_modules.len(),
        raw_modules.iter().map(|m| m.len()).sum::<usize>()
    );

    // Sort modules by dependency order (critical for multi-module packages!)
    let module_bytes = if raw_modules.len() > 1 {
        println!("🔄 Sorting modules by dependency order...");
        sort_modules_by_dependency(raw_modules)?
    } else {
        raw_modules
    };

    // Parse sender
    let sender = SuiAddress::from_str(&sender_str).context("Invalid sender address")?;
    println!("👤 Sender: {}", sender);

    // Query gas object from RPC if provided
    let gas_payment = if let Some(gas_id) = &gas_object_str {
        println!("🔍 Querying gas object from {}...", rpc_url);
        let gas_ref = get_gas_object_ref(&rpc_url, gas_id).await?;
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
            ObjectID::from_str("0x0000000000000000000000000000000000000000000000000000000000000000")?,
            SequenceNumber::from_u64(0),
            ObjectDigest::new([0; 32]),
        )
    };

    // Randomize gas budget using shared logic
    let (effective_gas_budget, extra_gas) = randomize_gas_budget(gas_budget);
    if extra_gas > 0 {
        println!(
            "Adjusted Gas Budget: {} (Base: {} + Random: {})",
            effective_gas_budget, gas_budget, extra_gas
        );
    }

    // Create transaction template with salt placeholder
    let (tx_template, salt_offset) = create_tx_template(
        sender,
        module_bytes,
        effective_gas_budget,
        gas_price,
        gas_payment,
    )?;
    println!(
        "📝 Transaction template: {} bytes (salt at offset {})",
        tx_template.len(),
        salt_offset
    );

    if export_template {
        println!("\n📤 Export for Web Miner:");
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!("TX_TEMPLATE_HEX={}", hex::encode(&tx_template));
        println!("NONCE_OFFSET={}", salt_offset);
        println!("BASE_GAS_BUDGET={}", gas_budget);
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return Ok(());
    }

    start_mining(
        tx_template,
        salt_offset,
        threads_opt,
        PackageMode,
        target,
        prefix,
    )
}

async fn run_gas_mining(
    prefix: String,
    split_amounts: Vec<u64>,
    sender_str: String,
    gas_budget: u64,
    gas_price: u64,
    gas_object_str: Option<String>,
    rpc_url: String,
    threads_opt: Option<usize>,
) -> Result<()> {
    let prefix = prefix.trim_start_matches("0x");
    let target = TargetChecker::from_hex_prefix(prefix).context("Failed to parse prefix")?;

    println!("🚀 Sui Gas Coin ID Miner");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🎯 Target prefix: 0x{}", prefix);
    println!("💰 Split amounts: {:?}", split_amounts);

    let sender = SuiAddress::from_str(&sender_str).context("Invalid sender address")?;

    let gas_payment = if let Some(gas_id) = &gas_object_str {
        println!("🔍 Querying gas object from {}...", rpc_url);
        get_gas_object_ref(&rpc_url, gas_id).await?
    } else {
        println!("⚠️  No gas object specified, using mock data");
        (
            ObjectID::from_str("0x0000000000000000000000000000000000000000000000000000000000000000")?,
            SequenceNumber::from_u64(0),
            ObjectDigest::new([0; 32]),
        )
    };

    let (effective_gas_budget, _) = randomize_gas_budget(gas_budget);

    let (tx_template, salt_offset, num_outputs) = create_split_tx_template(
        sender,
        split_amounts,
        effective_gas_budget,
        gas_price,
        gas_payment,
    )?;

    start_mining(
        tx_template,
        salt_offset,
        threads_opt,
        GasCoinMode::new(num_outputs),
        target,
        prefix,
    )
}

async fn run_move_mining(
    prefix: String,
    tx_base64: String,
    object_index: u16,
    threads_opt: Option<usize>,
) -> Result<()> {
    let prefix = prefix.trim_start_matches("0x");
    let target = TargetChecker::from_hex_prefix(prefix).context("Failed to parse prefix")?;

    println!("🚀 Sui Move Call ID Miner");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🎯 Target prefix: 0x{}", prefix);
    println!("🔢 Object Index: {}", object_index);

    let tx_bytes = general_purpose::STANDARD
        .decode(&tx_base64)
        .context("Failed to decode base64 transaction bytes")?;

    let (tx_template, salt_offset) = create_template_from_bytes(&tx_bytes)?;

    start_mining(
        tx_template,
        salt_offset,
        threads_opt,
        SingleObjectMode::new(object_index),
        target,
        prefix,
    )
}

fn start_mining<M: crate::mining::mode::MiningMode>(
    tx_template: Vec<u8>,
    salt_offset: usize,
    threads_opt: Option<usize>,
    mode: M,
    target: TargetChecker,
    prefix: &str,
) -> Result<()> {
    let threads = threads_opt.unwrap_or_else(num_cpus::get);
    println!("🧵 Threads: {}", threads);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let total_attempts = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let cancel = Arc::new(AtomicBool::new(false));

    let cancel_clone = cancel.clone();
    ctrlc::set_handler(move || {
        println!("\n⛔ Cancelled by user");
        cancel_clone.store(true, Ordering::SeqCst);
    })
    .ok();

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

    let mut rng = OsRng;
    let start_epoch = rng.gen_range(100_000..(u64::MAX - 1_000_000_000));
    println!(
        "💻 Starting CPU mining... (Start Epoch: {})\n",
        format_large_number(start_epoch)
    );

    let executor = CpuExecutor::new();
    let config =
        MinerConfig::new(tx_template, salt_offset, threads).with_start_nonce(start_epoch);
    let result =
        executor.mine(mode, &config, &target, total_attempts.clone(), cancel.clone());

    cancel.store(true, Ordering::SeqCst);
    let _ = progress_handle.join();

    if let Some(result) = result {
        println!("\n");
        println!("🎉 ════════════════════════════════════════════════════════");
        println!("   FOUND MATCHING ID!");
        println!("════════════════════════════════════════════════════════════");
        println!();
        println!(
            "📦 Object ID:         0x{}",
            hex::encode(result.object_id.as_ref())
        );
        println!("📋 Transaction Digest: {}", result.tx_digest);
        println!("🔢 Index:             {}", result.object_index);
        println!(
            "🔢 Attempts:          {}",
            format_large_number(result.attempts)
        );
        println!("Gas Budget Used:    {}", result.gas_budget_used);
        println!();
        println!("📤 Transaction Bytes (Base64):");
        println!("────────────────────────────────────────────────────────────");
        println!("{}", general_purpose::STANDARD.encode(&result.tx_bytes));
        println!("────────────────────────────────────────────────────────────");
    } else {
        println!("\n❌ Mining cancelled without finding a match.");
    }

    Ok(())
}

fn load_module_bytes(path: &Option<PathBuf>) -> Result<Vec<Vec<u8>>> {
    match path {
        Some(p) if p.is_dir() => {
            let mut entries: Vec<_> = fs::read_dir(p)?
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let path = e.path();
                    let is_mv = path.extension().map_or(false, |ext| ext == "mv");
                    let is_test = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map_or(false, |name| {
                            name.ends_with("_tests") || name.ends_with("_test")
                        });
                    is_mv && !is_test
                })
                .collect();

            entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

            let mut modules = Vec::new();
            for entry in entries {
                modules.push(fs::read(entry.path())?);
            }

            if modules.is_empty() {
                anyhow::bail!("No .mv files found in directory");
            }

            println!(
                "   📦 Loaded {} module(s) (sorted by filename)",
                modules.len()
            );
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
            println!("⚠️  No module path specified, using mock data for testing");
            Ok(vec![vec![0u8; 100]])
        }
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
