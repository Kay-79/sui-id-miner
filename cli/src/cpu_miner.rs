use crate::target::TargetChecker;
use crate::types::MiningResult;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use sui_types::base_types::ObjectID;

/// CPU-based miner using native threads with thread-local buffers
pub struct CpuMiner {
    tx_template: Vec<u8>,
    nonce_offset: usize,  // Offset where nonce (gas_budget) is located
    base_gas_budget: u64, // Base gas budget value
    target: TargetChecker,
    threads: usize,
}

impl CpuMiner {
    pub fn new(
        tx_template: Vec<u8>,
        nonce_offset: usize,
        target: TargetChecker,
        threads: usize,
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
        }
    }

    /// Start mining, returns when a match is found or cancelled
    pub fn mine(
        &self,
        start_nonce: u64,
        total_attempts: Arc<AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Option<MiningResult> {
        let found = Arc::new(AtomicBool::new(false));
        let result_holder: Arc<std::sync::Mutex<Option<MiningResult>>> =
            Arc::new(std::sync::Mutex::new(None));

        // Each thread gets a range of nonces to work on
        // Start from start_nonce for resume functionality
        let nonce_counter = Arc::new(AtomicU64::new(start_nonce));
        let initial_start_nonce = start_nonce; // Save for calculating relative attempts
        let chunk_size = 10_000u64; // Each thread grabs 10K nonces at a time

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

                thread::spawn(move || {
                    // Thread-local buffer - only allocated ONCE per thread!
                    let mut tx_bytes = tx_template;

                    while !cancel.load(Ordering::Relaxed) && !found.load(Ordering::Relaxed) {
                        // Grab a chunk of nonces atomically
                        let start_nonce = nonce_counter.fetch_add(chunk_size, Ordering::Relaxed);

                        for i in 0..chunk_size {
                            if found.load(Ordering::Relaxed) {
                                return;
                            }

                            let n = start_nonce + i;
                            let varied_gas_budget = base_gas_budget.wrapping_add(n);

                            // FAST: Only modify 8 bytes in the existing buffer
                            tx_bytes[nonce_offset..nonce_offset + 8]
                                .copy_from_slice(&varied_gas_budget.to_le_bytes());

                            // Parse and check
                            if let Ok(tx_data) = bcs::from_bytes::<
                                sui_types::transaction::TransactionData,
                            >(&tx_bytes)
                            {
                                let tx_digest = tx_data.digest();
                                let package_id = ObjectID::derive_id(tx_digest, 0);

                                if target.matches(&package_id.into_bytes()) {
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
                                        // Calculate relative attempts (not absolute nonce)
                                        let relative_attempts =
                                            n.saturating_sub(initial_start_nonce);
                                        let result = MiningResult {
                                            package_id,
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
