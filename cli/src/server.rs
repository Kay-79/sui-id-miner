//! WebSocket Server for Web Mining Interface

use crate::cpu_miner::CpuMiner;
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

use sui_types::{
    base_types::{ObjectDigest, ObjectID, SequenceNumber, SuiAddress},
    programmable_transaction_builder::ProgrammableTransactionBuilder,
    transaction::TransactionData,
};

use fastcrypto::hash::{Blake2b256, HashFunction};
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
    },
    #[serde(rename = "start_address_mining")]
    StartAddressMining {
        prefix: String,
        threads: Option<usize>,
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

    #[serde(rename = "address_found")]
    AddressFound {
        address: String,
        private_key: String,
        public_key: String,
        attempts: u64,
    },

    #[serde(rename = "stopped")]
    Stopped { attempts: u64 },

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

                        cancel.store(false, Ordering::SeqCst);
                        let cancel_clone = cancel.clone();
                        let out_tx_clone = out_tx.clone();
                        let thread_count = threads.unwrap_or_else(num_cpus::get);

                        tokio::task::spawn_blocking(move || {
                            let result = run_package_mining(
                                prefix,
                                modules,
                                sender,
                                gas_budget,
                                gas_price,
                                gas_object_id,
                                gas_object_version,
                                gas_object_digest,
                                thread_count,
                                cancel_clone,
                                out_tx_clone,
                            );

                            if let Err(e) = result {
                                eprintln!("Package mining error: {}", e);
                            }
                        });
                    }
                    Ok(ClientMessage::StartAddressMining { prefix, threads }) => {
                        cancel.store(false, Ordering::SeqCst);
                        let cancel_clone = cancel.clone();
                        let out_tx_clone = out_tx.clone();
                        let thread_count = threads.unwrap_or_else(num_cpus::get);

                        tokio::task::spawn_blocking(move || {
                            run_address_mining(prefix, thread_count, cancel_clone, out_tx_clone);
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
// ADDRESS MINING
// =============================================================================

fn run_address_mining(
    prefix: String,
    threads: usize,
    cancel: Arc<AtomicBool>,
    out_tx: mpsc::Sender<ServerMessage>,
) {
    use ed25519_dalek::SigningKey;

    let prefix_lower = prefix.to_lowercase();
    let prefix_bytes = match hex::decode(if prefix_lower.len() % 2 == 1 {
        format!("{}0", prefix_lower)
    } else {
        prefix_lower.clone()
    }) {
        Ok(b) => b,
        Err(_) => {
            let _ = out_tx.blocking_send(ServerMessage::Error {
                message: "Invalid hex prefix".to_string(),
            });
            return;
        }
    };
    let nibble_count = prefix_lower.len();
    let difficulty = nibble_count;
    let estimated_attempts = 16u64.pow(difficulty as u32);

    let _ = out_tx.blocking_send(ServerMessage::MiningStarted {
        mode: "ADDRESS".to_string(),
        prefix: prefix_lower.clone(),
        difficulty,
        estimated_attempts,
        threads,
    });

    let found = Arc::new(AtomicBool::new(false));
    let total_attempts = Arc::new(std::sync::atomic::AtomicU64::new(0));

    // Progress reporter
    let out_tx_progress = out_tx.clone();
    let cancel_progress = cancel.clone();
    let total_attempts_progress = total_attempts.clone();
    let progress_thread = thread::spawn(move || {
        let mut last = 0u64;
        let mut last_time = std::time::Instant::now();
        while !cancel_progress.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(500));
            let current = total_attempts_progress.load(Ordering::Relaxed);
            let now = std::time::Instant::now();
            let elapsed = now.duration_since(last_time).as_secs_f64();
            let hashrate = if elapsed > 0.0 {
                (current - last) as f64 / elapsed
            } else {
                0.0
            };
            let _ = out_tx_progress.blocking_send(ServerMessage::Progress {
                attempts: current,
                hashrate,
            });
            last = current;
            last_time = now;
        }
    });

    // Mining threads
    let handles: Vec<_> = (0..threads)
        .map(|_| {
            let prefix_bytes = prefix_bytes.clone();
            let cancel = cancel.clone();
            let found = found.clone();
            let total_attempts = total_attempts.clone();
            let out_tx = out_tx.clone();
            let nibble_count = nibble_count;

            thread::spawn(move || {
                let mut rng = OsRng;
                let mut local_attempts = 0u64;

                while !cancel.load(Ordering::Relaxed) && !found.load(Ordering::Relaxed) {
                    let signing_key = SigningKey::generate(&mut rng);
                    let public_key = signing_key.verifying_key();
                    let public_key_bytes: [u8; 32] = public_key.to_bytes();

                    // Derive address: Blake2b256(0x00 || pubkey)
                    let mut hasher = Blake2b256::default();
                    hasher.update(&[0x00]);
                    hasher.update(&public_key_bytes);
                    let address: [u8; 32] = hasher.finalize().into();

                    local_attempts += 1;

                    if matches_prefix(&address, &prefix_bytes, nibble_count) {
                        if found
                            .compare_exchange(false, true, Ordering::SeqCst, Ordering::Relaxed)
                            .is_ok()
                        {
                            let _ = out_tx.blocking_send(ServerMessage::AddressFound {
                                address: format!("0x{}", hex::encode(address)),
                                private_key: hex::encode(signing_key.to_bytes()),
                                public_key: hex::encode(public_key_bytes),
                                attempts: total_attempts.load(Ordering::Relaxed) + local_attempts,
                            });
                        }
                        return;
                    }

                    if local_attempts % 10000 == 0 {
                        total_attempts.fetch_add(10000, Ordering::Relaxed);
                    }
                }
            })
        })
        .collect();

    for h in handles {
        let _ = h.join();
    }

    cancel.store(true, Ordering::SeqCst);
    let _ = progress_thread.join();

    if !found.load(Ordering::Relaxed) {
        let _ = out_tx.blocking_send(ServerMessage::Stopped {
            attempts: total_attempts.load(Ordering::Relaxed),
        });
    }
}

fn matches_prefix(address: &[u8; 32], prefix_bytes: &[u8], nibble_count: usize) -> bool {
    let full_bytes = nibble_count / 2;
    let has_half = nibble_count % 2 == 1;

    for i in 0..full_bytes {
        if address[i] != prefix_bytes[i] {
            return false;
        }
    }

    if has_half {
        let expected_nibble = prefix_bytes[full_bytes] >> 4;
        let actual_nibble = address[full_bytes] >> 4;
        if expected_nibble != actual_nibble {
            return false;
        }
    }

    true
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
    cancel: Arc<AtomicBool>,
    out_tx: mpsc::Sender<ServerMessage>,
) -> Result<()> {
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

    let (tx_template, salt_offset) =
        create_tx_template(sender_addr, modules, gas_budget, gas_price, gas_payment)?;

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
    let result = miner.mine(total_attempts.clone(), cancel.clone());

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
        let _ = out_tx.blocking_send(ServerMessage::Stopped { attempts: 0 });
    }

    Ok(())
}

fn create_tx_template(
    sender: SuiAddress,
    module_bytes: Vec<Vec<u8>>,
    base_gas_budget: u64,
    gas_price: u64,
    gas_payment: (ObjectID, SequenceNumber, ObjectDigest),
) -> Result<(Vec<u8>, usize)> {
    use std::str::FromStr;

    let dependencies = vec![ObjectID::from_str("0x1")?, ObjectID::from_str("0x2")?];
    let mut ptb = ProgrammableTransactionBuilder::new();
    let upgrade_cap = ptb.publish_upgradeable(module_bytes, dependencies);
    ptb.transfer_arg(sender, upgrade_cap);
    let pt = ptb.finish();

    let placeholder_gas_budget = 0xAAAAAAAAAAAAAAAAu64;
    let tx_data = TransactionData::new_programmable(
        sender,
        vec![gas_payment],
        pt,
        placeholder_gas_budget,
        gas_price,
    );

    let tx_bytes = bcs::to_bytes(&tx_data)?;
    let placeholder_bytes = placeholder_gas_budget.to_le_bytes();
    let gas_budget_offset = tx_bytes
        .windows(placeholder_bytes.len())
        .position(|window| window == placeholder_bytes)
        .context("Could not find gas_budget placeholder")?;

    let mut tx_template = tx_bytes;
    tx_template[gas_budget_offset..gas_budget_offset + 8]
        .copy_from_slice(&base_gas_budget.to_le_bytes());

    Ok((tx_template, gas_budget_offset))
}
