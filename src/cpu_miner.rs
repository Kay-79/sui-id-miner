use crate::target::TargetChecker;
use crate::types::{MiningProgress, MiningResult};
use crossbeam_channel::Sender;
use fastcrypto::hash::{Blake2b256, HashFunction, Sha3_256};
use rayon::prelude::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use sui_types::{base_types::ObjectID, digests::TransactionDigest};

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
        progress_tx: Sender<MiningProgress>,
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
                    if let Ok(tx_data) = bcs::from_bytes::<sui_types::transaction::TransactionData>(&tx_bytes) {
                       let tx_digest = tx_data.digest();
                       let tx_digest_bytes: [u8; 32] = tx_digest.into_inner();
                       
                       // Compute Package ID from this digest and index (which is likely 1 for most cases, or loop if parallel publishing)
                       // Assuming index 1 for published package (first object created usually UpgradeCap, then Package?)
                       // Actually, miner logic assumes index 0 or similar.
                       // Let's use the helper we have but with correct digest.
                       // Wait, helper 'compute_package_id_bytes' needs [u8;32] digest.
                       
                       // Check all created object IDs (indices) just in case? 
                       // Usually package is index 1 of created objects?
                       // Previous code assumed a specific index?
                       // Previous code used `compute_package_id_bytes(tx_digest_bytes, i as u64)`.
                       // Where i is loop 0..created_count.
                       
                       // To be safe and fast, we just check the digest that creates the package.
                       // But the package ID derivation depends on the index in the effects.
                       
                       // Let's keep the target checking logic, but pass the CORRECT digest.
                       // The original code passed `tx_digest_bytes` to `self.target.matches(&package_id)`.
                       // But `package_id` is derived from `tx_digest` and `index`.
                       
                       // Let's iterate indices like before
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
                            
                            if progress_tx.send(MiningProgress {
                                attempts: n, 
                                found: Some(result.clone()),
                            }).is_err() {
                                return None;
                            }
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
            let _ = progress_tx.send(MiningProgress {
                attempts: nonce,
                found: None,
            });
        }
    }
}

#[inline(always)]
fn blake2b_256_with_intent(tx_bytes: &[u8]) -> [u8; 32] {
    // Intent prefix for TransactionData signing
    const INTENT_PREFIX: [u8; 3] = [0, 0, 0];
    
    let mut hasher = Blake2b256::default();
    hasher.update(&INTENT_PREFIX);
    hasher.update(tx_bytes);
    hasher.finalize().into()
}

