use crate::target::TargetChecker;
use crate::types::MiningResult;

use rayon::prelude::*;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use sui_types::base_types::ObjectID;

/// CPU-based miner using Rayon for parallel processing
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
        total_attempts: Arc<std::sync::atomic::AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Option<MiningResult> {
        // Configure thread pool
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(self.threads)
            .build()
            .unwrap();

        let batch_size = 100_000u64;
        let mut nonce: u64 = 0;

        loop {
            if cancel.load(Ordering::Relaxed) {
                return None;
            }

            // Process a batch and check for match
            let maybe_result = pool.install(|| {
                (0..batch_size).into_par_iter().find_map_any(|i| {
                    if cancel.load(Ordering::Relaxed) {
                        return None;
                    }

                    let n = nonce + i;

                    // Vary gas_budget by adding nonce to base value
                    // Keep it within reasonable range (base + 0 to base + 2^32)
                    let varied_gas_budget = self.base_gas_budget.wrapping_add(n);

                    // Build tx_bytes with varied gas_budget
                    // Update gas budget in bytes
                    let mut tx_bytes = self.tx_template.clone();
                    tx_bytes[self.nonce_offset..self.nonce_offset + 8]
                        .copy_from_slice(&varied_gas_budget.to_le_bytes());

                    // Use TransactionData::digest() for correct hash calculation
                    // This is slower but guarantees on-chain match
                    if let Ok(tx_data) =
                        bcs::from_bytes::<sui_types::transaction::TransactionData>(&tx_bytes)
                    {
                        let tx_digest = tx_data.digest();

                        // Check ONLY Index 0 for Package ID
                        // We verified that Publish always produces Package ID at Index 0.
                        // Scanning other indices produces false positives (valid digest, but wrong object ID matching prefix).
                        let idx = 0;
                        let package_id = ObjectID::derive_id(tx_digest, idx);
                        if self.target.matches(&package_id.into_bytes()) {
                            let result = MiningResult {
                                package_id,
                                tx_digest,
                                tx_bytes: tx_bytes.clone(),
                                nonce: n,
                                gas_budget_used: varied_gas_budget,
                                attempts: n,
                            };

                            return Some(result);
                        }
                    }

                    None
                })
            });

            // If found, return immediately
            if let Some(result) = maybe_result {
                return Some(result);
            }

            // Update progress
            nonce += batch_size;
            total_attempts.fetch_add(batch_size, Ordering::Relaxed);
        }
    }
}
