//! Mining executors - Backend implementations for mining

use crate::mining::config::MinerConfig;
use crate::mining::mode::{MiningMode, MiningResult};
use crate::target::TargetChecker;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;

/// Trait for mining execution backends
pub trait MinerExecutor {
    /// Execute mining with the given mode and configuration
    fn mine<M: MiningMode>(
        &self,
        mode: M,
        config: &MinerConfig,
        target: &TargetChecker,
        total_attempts: Arc<AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Option<MiningResult>;
}

/// CPU-based mining executor using native threads
pub struct CpuExecutor;

impl CpuExecutor {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CpuExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl MinerExecutor for CpuExecutor {
    fn mine<M: MiningMode>(
        &self,
        mode: M,
        config: &MinerConfig,
        target: &TargetChecker,
        total_attempts: Arc<AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Option<MiningResult> {
        let found = Arc::new(AtomicBool::new(false));
        let result_holder: Arc<std::sync::Mutex<Option<MiningResult>>> =
            Arc::new(std::sync::Mutex::new(None));

        let nonce_counter = Arc::new(AtomicU64::new(config.start_nonce));
        let initial_start_nonce = config.start_nonce;
        let chunk_size = 10_000u64;
        let base_gas_budget = config.base_gas_budget();

        let handles: Vec<_> = (0..config.threads)
            .map(|_| {
                let tx_template = config.tx_template.clone();
                let nonce_offset = config.nonce_offset;
                let target = target.clone();
                let mode = mode.clone();
                let cancel = cancel.clone();
                let found = found.clone();
                let result_holder = result_holder.clone();
                let nonce_counter = nonce_counter.clone();
                let total_attempts = total_attempts.clone();

                thread::spawn(move || {
                    // Thread-local buffer - only allocated ONCE per thread
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

                            // Modify nonce in buffer
                            tx_bytes[nonce_offset..nonce_offset + 8]
                                .copy_from_slice(&varied_gas_budget.to_le_bytes());

                            // Parse transaction
                            if let Ok(tx_data) = bcs::from_bytes::<
                                sui_types::transaction::TransactionData,
                            >(&tx_bytes)
                            {
                                let tx_digest = tx_data.digest();

                                // Use mode to check for match
                                if let Some((object_id, object_index)) =
                                    mode.check_match(&tx_digest, &target)
                                {
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
                                        let result = MiningResult {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_executor_creation() {
        let executor = CpuExecutor::new();
        // Just verify it can be created
        let _ = executor;
    }

    #[test]
    fn test_cpu_executor_default() {
        let executor = CpuExecutor::default();
        let _ = executor;
    }
}
