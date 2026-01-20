use crate::target::TargetChecker;
use crate::types::GasCoinMiningResult;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use sui_types::base_types::ObjectID;

/// CPU-based miner for Gas Coin Object IDs
/// Similar to package mining but checks multiple object indices (one per split coin)
pub struct GasCoinMiner {
    tx_template: Vec<u8>,
    nonce_offset: usize,
    base_gas_budget: u64,
    target: TargetChecker,
    threads: usize,
    num_outputs: u16, // Number of coins being created (to check multiple indices)
}

impl GasCoinMiner {
    pub fn new(
        tx_template: Vec<u8>,
        nonce_offset: usize,
        target: TargetChecker,
        threads: usize,
        num_outputs: u16,
    ) -> Self {
        // Extract base gas_budget from template
        let mut gas_bytes = [0u8; 8];
        gas_bytes.copy_from_slice(&tx_template[nonce_offset..nonce_offset + 8]);
        let base_gas_budget = u64::from_le_bytes(gas_bytes);

        Self {
            tx_template,
            nonce_offset,
            base_gas_budget,
            target,
            threads,
            num_outputs,
        }
    }

    /// Start mining, returns when a match is found or cancelled
    pub fn mine(
        &self,
        start_nonce: u64,
        total_attempts: Arc<AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Option<GasCoinMiningResult> {
        let found = Arc::new(AtomicBool::new(false));
        let result_holder: Arc<std::sync::Mutex<Option<GasCoinMiningResult>>> =
            Arc::new(std::sync::Mutex::new(None));

        let nonce_counter = Arc::new(AtomicU64::new(start_nonce));
        let initial_start_nonce = start_nonce;
        let chunk_size = 10_000u64;

        let handles: Vec<_> = (0..self.threads)
            .map(|_| {
                let tx_template = self.tx_template.clone();
                let nonce_offset = self.nonce_offset;
                let base_gas_budget = self.base_gas_budget;
                let target = self.target.clone();
                let cancel = cancel.clone();
                let found = found.clone();
                let result_holder = result_holder.clone();
                let nonce_counter = nonce_counter.clone();
                let total_attempts = total_attempts.clone();
                let num_outputs = self.num_outputs;

                thread::spawn(move || {
                    let mut tx_bytes = tx_template;

                    while !cancel.load(Ordering::Relaxed) && !found.load(Ordering::Relaxed) {
                        let start_nonce = nonce_counter.fetch_add(chunk_size, Ordering::Relaxed);

                        for i in 0..chunk_size {
                            if found.load(Ordering::Relaxed) {
                                return;
                            }

                            let n = start_nonce + i;
                            let varied_gas_budget = base_gas_budget.wrapping_add(n);

                            // Modify nonce in buffer
                            tx_bytes[nonce_offset..nonce_offset + 8]
                                .copy_from_slice(&varied_gas_budget.to_le_bytes());

                            // Parse and check
                            if let Ok(tx_data) = bcs::from_bytes::<
                                sui_types::transaction::TransactionData,
                            >(&tx_bytes)
                            {
                                let tx_digest = tx_data.digest();

                                // Check ALL output indices (each split creates a new coin)
                                for object_index in 0..num_outputs {
                                    let object_id = ObjectID::derive_id(tx_digest, object_index as u64);

                                    if target.matches(&object_id.into_bytes()) {
                                        // Found!
                                        if found
                                            .compare_exchange(
                                                false,
                                                true,
                                                Ordering::SeqCst,
                                                Ordering::Relaxed,
                                            )
                                            .is_ok()
                                        {
                                            let relative_attempts =
                                                n.saturating_sub(initial_start_nonce);
                                            let result = GasCoinMiningResult {
                                                object_id,
                                                object_index,
                                                tx_digest,
                                                tx_bytes: tx_bytes.clone(),
                                                nonce: n,
                                                gas_budget_used: varied_gas_budget,
                                                attempts: relative_attempts,
                                            };
                                            *result_holder.lock().unwrap() = Some(result);
                                        }
                                        return;
                                    }
                                }
                            }
                        }

                        // Report progress after each chunk
                        total_attempts.fetch_add(chunk_size, Ordering::Relaxed);
                    }
                })
            })
            .collect();

        // Wait for all threads
        for handle in handles {
            let _ = handle.join();
        }

        // Return result if found
        let guard = result_holder.lock().unwrap();
        guard.clone()
    }
}
