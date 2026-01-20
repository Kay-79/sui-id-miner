//! WebSocket Server for Web Mining Interface

use crate::cpu_miner::CpuMiner;
use crate::gas_coin_miner::GasCoinMiner;
use crate::module_order::sort_modules_by_dependency;
use crate::target::TargetChecker;

use anyhow::{Context, Result};
use base64::{Engine as _, engine::general_purpose};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};

use sui_types::base_types::{ObjectDigest, ObjectID, SequenceNumber, SuiAddress};

use crate::common::{create_tx_template, create_split_tx_template, format_large_number, randomize_gas_budget};
use rand::Rng;
use rand::rngs::OsRng;

/// Message from Web Client
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "start_package_mining")]
    StartPackageMining {
        prefix: String,
        modules_base64: Vec<String>,
        sender: String,
        gas_budget: u64,
        gas_price: u64,
        gas_object_id: String,
        gas_object_version: u64,
        gas_object_digest: String,
        threads: Option<usize>,
        #[serde(default)]
        nonce_offset: u64, // Resume from this nonce
    },
    #[serde(rename = "start_gas_coin_mining")]
    StartGasCoinMining {
        prefix: String,
        split_amounts: Vec<u64>,
        sender: String,
        gas_budget: u64,
        gas_price: u64,
        gas_object_id: String,
        gas_object_version: u64,
        gas_object_digest: String,
        threads: Option<usize>,
        #[serde(default)]
        nonce_offset: u64,
    },
    #[serde(rename = "stop_mining")]
    StopMining,
}

/// Message to Web Client
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "connected")]
    Connected { version: String },

    #[serde(rename = "mining_started")]
    MiningStarted {
        mode: String,
        prefix: String,
        difficulty: usize,
        estimated_attempts: u64,
        threads: usize,
    },

    #[serde(rename = "progress")]
    Progress { attempts: u64, hashrate: f64 },

    #[serde(rename = "package_found")]
    PackageFound {
        package_id: String,
        tx_digest: String,
        tx_bytes_base64: String,
        attempts: u64,
        gas_budget_used: u64,
    },

    #[serde(rename = "gas_coin_found")]
    GasCoinFound {
        object_id: String,
        object_index: u16,
        tx_digest: String,
        tx_bytes_base64: String,
        attempts: u64,
        gas_budget_used: u64,
    },

    #[serde(rename = "stopped")]
    Stopped { attempts: u64, last_nonce: u64 },

    #[serde(rename = "error")]
    Error { message: String },
}

pub async fn run_server(port: u16, default_modules: Option<Vec<Vec<u8>>>) -> Result<()> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;

    println!("🌐 WebSocket Server listening on ws://{}", addr);
    if default_modules.is_some() {
        println!("   📦 Loaded default modules from arguments");
    }
    println!("   Connect from Web App to start mining.");
    println!("   Press Ctrl+C to stop server.\n");

    let default_modules = Arc::new(default_modules);

    while let Ok((stream, peer)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, peer, default_modules.clone()));
    }

    Ok(())
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    default_modules: Arc<Option<Vec<Vec<u8>>>>,
) {
    println!("📡 New connection from: {}", peer);

    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("   Failed to accept WebSocket: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Send welcome message
    let welcome = ServerMessage::Connected {
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    if let Ok(json) = serde_json::to_string(&welcome) {
        let _ = ws_sender.send(Message::Text(json.into())).await;
    }

    // Mining state
    let cancel = Arc::new(AtomicBool::new(false));
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMessage>(100);

    // Task to forward messages to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Process incoming messages
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let text_str: &str = &text;
                match serde_json::from_str::<ClientMessage>(text_str) {
                    Ok(ClientMessage::StartPackageMining {
                        prefix,
                        modules_base64,
                        sender,
                        gas_budget,
                        gas_price,
                        gas_object_id,
                        gas_object_version,
                        gas_object_digest,
                        threads,
                        nonce_offset,
                    }) => {
                        // Use client modules if provided, otherwise fallback to default
                        let mut mut_modules = modules_base64
                            .iter()
                            .filter_map(|b64| general_purpose::STANDARD.decode(b64).ok())
                            .collect::<Vec<Vec<u8>>>();

                        if mut_modules.is_empty() {
                            if let Some(defaults) = default_modules.as_ref() {
                                println!("   📦 Using loaded default modules");
                                mut_modules = defaults.clone();
                            }
                        }

                        let modules = mut_modules;

                        if modules.is_empty() {
                            let _ = out_tx
                                .send(ServerMessage::Error {
                                    message:
                                        "No valid modules provided and no default modules loaded"
                                            .to_string(),
                                })
                                .await;
                            continue;
                        }

                        // Sort modules by dependency order (critical for multi-module packages!)
                        let sorted_modules = if modules.len() > 1 {
                            println!(
                                "   🔄 Sorting {} modules by dependency order...",
                                modules.len()
                            );
                            match sort_modules_by_dependency(modules) {
                                Ok(sorted) => sorted,
                                Err(e) => {
                                    let _ = out_tx
                                        .send(ServerMessage::Error {
                                            message: format!("Failed to sort modules: {}", e),
                                        })
                                        .await;
                                    continue;
                                }
                            }
                        } else {
                            modules
                        };

                        cancel.store(false, Ordering::SeqCst);
                        let cancel_clone = cancel.clone();
                        let out_tx_clone = out_tx.clone();
                        let thread_count = threads.unwrap_or_else(num_cpus::get);

                        tokio::task::spawn_blocking(move || {
                            let result = run_package_mining(
                                prefix,
                                sorted_modules,
                                sender,
                                gas_budget,
                                gas_price,
                                gas_object_id,
                                gas_object_version,
                                gas_object_digest,
                                thread_count,
                                nonce_offset,
                                cancel_clone,
                                out_tx_clone,
                            );

                            if let Err(e) = result {
                                eprintln!("Package mining error: {}", e);
                            }
                        });
                    }
                    Ok(ClientMessage::StartGasCoinMining {
                        prefix,
                        split_amounts,
                        sender,
                        gas_budget,
                        gas_price,
                        gas_object_id,
                        gas_object_version,
                        gas_object_digest,
                        threads,
                        nonce_offset,
                    }) => {
                        if split_amounts.is_empty() {
                            let _ = out_tx
                                .send(ServerMessage::Error {
                                    message: "split_amounts must not be empty".to_string(),
                                })
                                .await;
                            continue;
                        }

                        cancel.store(false, Ordering::SeqCst);
                        let cancel_clone = cancel.clone();
                        let out_tx_clone = out_tx.clone();
                        let thread_count = threads.unwrap_or_else(num_cpus::get);

                        tokio::task::spawn_blocking(move || {
                            let result = run_gas_coin_mining(
                                prefix,
                                split_amounts,
                                sender,
                                gas_budget,
                                gas_price,
                                gas_object_id,
                                gas_object_version,
                                gas_object_digest,
                                thread_count,
                                nonce_offset,
                                cancel_clone,
                                out_tx_clone,
                            );

                            if let Err(e) = result {
                                eprintln!("Gas coin mining error: {}", e);
                            }
                        });
                    }
                    Ok(ClientMessage::StopMining) => {
                        cancel.store(true, Ordering::SeqCst);
                    }
                    Err(e) => {
                        let _ = out_tx
                            .send(ServerMessage::Error {
                                message: format!("Invalid message: {}", e),
                            })
                            .await;
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    cancel.store(true, Ordering::SeqCst);
    send_task.abort();
    println!("📴 Connection closed: {}", peer);
}

// =============================================================================
// PACKAGE MINING
// =============================================================================

fn run_package_mining(
    prefix: String,
    modules: Vec<Vec<u8>>,
    sender: String,
    gas_budget: u64,
    gas_price: u64,
    gas_object_id: String,
    gas_object_version: u64,
    gas_object_digest: String,
    threads: usize,
    mut start_nonce: u64,
    cancel: Arc<AtomicBool>,
    out_tx: mpsc::Sender<ServerMessage>,
) -> Result<()> {
    // If start_nonce is 0 (fresh start), randomize it to avoid re-mining the same range.
    // Range: [100,000, u64::MAX - 8_446_744_073_709_551_615]
    // 100,000 is safe buffer above current mainnet epoch.
    // u64::MAX buffer avoids immediate overflow during crunching.
    if start_nonce == 0 {
        let mut rng = OsRng;
        start_nonce = rng.gen_range(100_000..(u64::MAX - 8_446_744_073_709_551_615));
        println!(
            "Mining starting with randomized expiration epoch: {}",
            format_large_number(start_nonce)
        );
    }

    // Randomize gas budget using shared logic
    let (effective_gas_budget, extra_gas) = randomize_gas_budget(gas_budget);
    if extra_gas > 0 {
        println!(
            "Adjusted Gas Budget: {} (Base: {} + Random: {})",
            effective_gas_budget, gas_budget, extra_gas
        );
    }

    use std::str::FromStr;

    let target = TargetChecker::from_hex_prefix(&prefix).context("Invalid prefix")?;
    let sender_addr = SuiAddress::from_str(&sender).context("Invalid sender")?;

    let gas_obj_id = ObjectID::from_str(&gas_object_id).context("Invalid gas object ID")?;
    let gas_seq = SequenceNumber::from_u64(gas_object_version);

    let digest_bytes = bs58::decode(&gas_object_digest)
        .into_vec()
        .context("Invalid gas object digest (expected Base58)")?;
    let mut digest_arr = [0u8; 32];
    if digest_bytes.len() != 32 {
        anyhow::bail!("Gas object digest must be 32 bytes");
    }
    digest_arr.copy_from_slice(&digest_bytes);
    let gas_digest = ObjectDigest::new(digest_arr);

    let gas_payment = (gas_obj_id, gas_seq, gas_digest);

    let (tx_template, salt_offset) = create_tx_template(
        sender_addr,
        modules,
        effective_gas_budget,
        gas_price,
        gas_payment,
    )?;

    let _ = out_tx.blocking_send(ServerMessage::MiningStarted {
        mode: "PACKAGE".to_string(),
        prefix: prefix.clone(),
        difficulty: target.difficulty(),
        estimated_attempts: target.estimated_attempts(),
        threads,
    });

    let total_attempts = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let out_tx_progress = out_tx.clone();
    let cancel_progress = cancel.clone();
    let total_attempts_progress = total_attempts.clone();

    let progress_thread = thread::spawn(move || {
        let mut last_attempts = 0u64;
        let mut last_time = std::time::Instant::now();

        while !cancel_progress.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(500));

            let current = total_attempts_progress.load(Ordering::Relaxed);
            let now = std::time::Instant::now();
            let elapsed = now.duration_since(last_time).as_secs_f64();
            let hashrate = if elapsed > 0.0 {
                (current - last_attempts) as f64 / elapsed
            } else {
                0.0
            };

            let _ = out_tx_progress.blocking_send(ServerMessage::Progress {
                attempts: current,
                hashrate,
            });

            last_attempts = current;
            last_time = now;
        }
    });

    let miner = CpuMiner::new(tx_template, salt_offset, target, threads);
    let result = miner.mine(start_nonce, total_attempts.clone(), cancel.clone());

    cancel.store(true, Ordering::SeqCst);
    let _ = progress_thread.join();

    if let Some(res) = result {
        let _ = out_tx.blocking_send(ServerMessage::PackageFound {
            package_id: format!("0x{}", hex::encode(res.package_id.as_ref())),
            tx_digest: res.tx_digest.to_string(),
            tx_bytes_base64: general_purpose::STANDARD.encode(&res.tx_bytes),
            attempts: res.attempts,
            gas_budget_used: res.gas_budget_used,
        });
    } else {
        // Return last nonce so FE can resume
        let last_nonce = total_attempts.load(Ordering::Relaxed);
        let _ = out_tx.blocking_send(ServerMessage::Stopped {
            attempts: last_nonce,
            last_nonce,
        });
    }

    Ok(())
}

// =============================================================================
// GAS COIN MINING
// =============================================================================

fn run_gas_coin_mining(
    prefix: String,
    split_amounts: Vec<u64>,
    sender: String,
    gas_budget: u64,
    gas_price: u64,
    gas_object_id: String,
    gas_object_version: u64,
    gas_object_digest: String,
    threads: usize,
    mut start_nonce: u64,
    cancel: Arc<AtomicBool>,
    out_tx: mpsc::Sender<ServerMessage>,
) -> Result<()> {
    // If start_nonce is 0, randomize it
    if start_nonce == 0 {
        let mut rng = OsRng;
        start_nonce = rng.gen_range(100_000..(u64::MAX - 8_446_744_073_709_551_615));
        println!(
            "Gas coin mining starting with randomized expiration epoch: {}",
            format_large_number(start_nonce)
        );
    }

    // Randomize gas budget
    let (effective_gas_budget, extra_gas) = randomize_gas_budget(gas_budget);
    if extra_gas > 0 {
        println!(
            "Adjusted Gas Budget: {} (Base: {} + Random: {})",
            effective_gas_budget, gas_budget, extra_gas
        );
    }

    use std::str::FromStr;

    let target = TargetChecker::from_hex_prefix(&prefix).context("Invalid prefix")?;
    let sender_addr = SuiAddress::from_str(&sender).context("Invalid sender")?;

    let gas_obj_id = ObjectID::from_str(&gas_object_id).context("Invalid gas object ID")?;
    let gas_seq = SequenceNumber::from_u64(gas_object_version);

    let digest_bytes = bs58::decode(&gas_object_digest)
        .into_vec()
        .context("Invalid gas object digest (expected Base58)")?;
    let mut digest_arr = [0u8; 32];
    if digest_bytes.len() != 32 {
        anyhow::bail!("Gas object digest must be 32 bytes");
    }
    digest_arr.copy_from_slice(&digest_bytes);
    let gas_digest = ObjectDigest::new(digest_arr);

    let gas_payment = (gas_obj_id, gas_seq, gas_digest);

    let (tx_template, salt_offset, num_outputs) = create_split_tx_template(
        sender_addr,
        split_amounts.clone(),
        effective_gas_budget,
        gas_price,
        gas_payment,
    )?;

    println!(
        "🪙 Gas Coin mining: prefix=0x{}, split_amounts={:?}, outputs={}",
        prefix, split_amounts, num_outputs
    );

    let _ = out_tx.blocking_send(ServerMessage::MiningStarted {
        mode: "GAS_COIN".to_string(),
        prefix: prefix.clone(),
        difficulty: target.difficulty(),
        estimated_attempts: target.estimated_attempts(),
        threads,
    });

    let total_attempts = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let out_tx_progress = out_tx.clone();
    let cancel_progress = cancel.clone();
    let total_attempts_progress = total_attempts.clone();

    let progress_thread = thread::spawn(move || {
        let mut last_attempts = 0u64;
        let mut last_time = std::time::Instant::now();

        while !cancel_progress.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(500));

            let current = total_attempts_progress.load(Ordering::Relaxed);
            let now = std::time::Instant::now();
            let elapsed = now.duration_since(last_time).as_secs_f64();
            let hashrate = if elapsed > 0.0 {
                (current - last_attempts) as f64 / elapsed
            } else {
                0.0
            };

            let _ = out_tx_progress.blocking_send(ServerMessage::Progress {
                attempts: current,
                hashrate,
            });

            last_attempts = current;
            last_time = now;
        }
    });

    let miner = GasCoinMiner::new(tx_template, salt_offset, target, threads, num_outputs);
    let result = miner.mine(start_nonce, total_attempts.clone(), cancel.clone());

    cancel.store(true, Ordering::SeqCst);
    let _ = progress_thread.join();

    if let Some(res) = result {
        let _ = out_tx.blocking_send(ServerMessage::GasCoinFound {
            object_id: format!("0x{}", hex::encode(res.object_id.as_ref())),
            object_index: res.object_index,
            tx_digest: res.tx_digest.to_string(),
            tx_bytes_base64: general_purpose::STANDARD.encode(&res.tx_bytes),
            attempts: res.attempts,
            gas_budget_used: res.gas_budget_used,
        });
    } else {
        let last_nonce = total_attempts.load(Ordering::Relaxed);
        let _ = out_tx.blocking_send(ServerMessage::Stopped {
            attempts: last_nonce,
            last_nonce,
        });
    }

    Ok(())
}
