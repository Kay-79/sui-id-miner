//! WASM-compatible mining logic
//! This module provides a single-threaded mining function that can be called from WASM.

use crate::target::TargetChecker;
use sui_types::{base_types::ObjectID, transaction::TransactionData};

/// Result from a mining chunk operation
#[derive(Debug, Clone)]
pub struct WasmMiningResult {
    /// The package ID that matched the prefix (hex string with 0x)
    pub package_id: String,
    /// The transaction digest (hex string)
    pub tx_digest: String,
    /// The transaction bytes (for signing)
    pub tx_bytes: Vec<u8>,
    /// The nonce that was used
    pub nonce: u64,
    /// The gas budget that was used
    pub gas_budget_used: u64,
}

/// Mine a chunk of nonces, checking for prefix match.
///
/// # Arguments
/// * `tx_template` - The BCS-serialized transaction template
/// * `nonce_offset` - Offset in the template where the gas_budget (nonce) is located
/// * `base_gas_budget` - The base gas budget value
/// * `prefix` - The hex prefix to search for (without 0x)
/// * `nonce_start` - Starting nonce value
/// * `nonce_count` - Number of nonces to check
///
/// # Returns
/// * `Some(WasmMiningResult)` if a match is found
/// * `None` if no match in this chunk
pub fn mine_chunk(
    tx_template: &[u8],
    nonce_offset: usize,
    base_gas_budget: u64,
    prefix: &str,
    nonce_start: u64,
    nonce_count: u64,
) -> Option<WasmMiningResult> {
    let target = match TargetChecker::from_hex_prefix(prefix) {
        Ok(t) => t,
        Err(_) => return None,
    };

    for i in 0..nonce_count {
        let nonce = nonce_start + i;
        let varied_gas_budget = base_gas_budget.wrapping_add(nonce);

        // Build tx_bytes with varied gas_budget
        let mut tx_bytes = tx_template.to_vec();
        tx_bytes[nonce_offset..nonce_offset + 8].copy_from_slice(&varied_gas_budget.to_le_bytes());

        // Deserialize and compute digest
        if let Ok(tx_data) = bcs::from_bytes::<TransactionData>(&tx_bytes) {
            let tx_digest = tx_data.digest();

            // Check Index 0 for Package ID
            let package_id = ObjectID::derive_id(tx_digest, 0);
            if target.matches(&package_id.into_bytes()) {
                return Some(WasmMiningResult {
                    package_id: format!("0x{}", hex::encode(package_id.as_ref())),
                    tx_digest: tx_digest.to_string(),
                    tx_bytes,
                    nonce,
                    gas_budget_used: varied_gas_budget,
                });
            }
        }
    }

    None
}
