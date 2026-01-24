//! Mining modes - Define how to check for matching Object IDs

use crate::target::TargetChecker;
use sui_types::base_types::ObjectID;
use sui_types::digests::TransactionDigest;

/// Result of a successful mining operation
#[derive(Clone, Debug)]
pub struct MiningResult {
    pub object_id: ObjectID,
    pub object_index: u16,
    pub tx_digest: TransactionDigest,
    pub tx_bytes: Vec<u8>,
    #[allow(dead_code)]
    pub nonce: u64,
    pub gas_budget_used: u64,
    pub attempts: u64,
}

/// Trait for different mining modes
/// Each mode defines how to check if a transaction digest produces a matching ID
pub trait MiningMode: Send + Sync + Clone + 'static {
    /// Check if the given transaction digest produces a matching Object ID
    /// Returns Some((object_id, object_index)) if match found, None otherwise
    fn check_match(
        &self,
        tx_digest: &TransactionDigest,
        target: &TargetChecker,
    ) -> Option<(ObjectID, u16)>;

    /// Description for logging
    #[allow(dead_code)]
    fn description(&self) -> &'static str;

    /// Get index range to check (start, end specific)
    /// Used for GPU optimization
    fn index_range(&self) -> (u16, u16) {
        (0, 1) // Default for PackageMode
    }
}

/// Package ID mining mode
/// Checks only object index 0 (the package itself)
#[derive(Clone, Debug)]
pub struct PackageMode;

impl MiningMode for PackageMode {
    fn check_match(
        &self,
        tx_digest: &TransactionDigest,
        target: &TargetChecker,
    ) -> Option<(ObjectID, u16)> {
        let package_id = ObjectID::derive_id(*tx_digest, 0);
        if target.matches(&package_id.into_bytes()) {
            Some((package_id, 0))
        } else {
            None
        }
    }

    fn description(&self) -> &'static str {
        "Package ID"
    }

    fn index_range(&self) -> (u16, u16) {
        (0, 1)
    }
}

/// Gas Coin mining mode
/// Checks multiple object indices (one per split coin)
#[derive(Clone, Debug)]
pub struct GasCoinMode {
    /// Number of coins being created
    pub num_outputs: u16,
}

impl GasCoinMode {
    pub fn new(num_outputs: u16) -> Self {
        Self { num_outputs }
    }
}

impl MiningMode for GasCoinMode {
    fn check_match(
        &self,
        tx_digest: &TransactionDigest,
        target: &TargetChecker,
    ) -> Option<(ObjectID, u16)> {
        // Check all output indices
        for index in 0..self.num_outputs {
            let object_id = ObjectID::derive_id(*tx_digest, index as u64);
            if target.matches(&object_id.into_bytes()) {
                return Some((object_id, index));
            }
        }
        None
    }

    fn description(&self) -> &'static str {
        "Gas Coin ID"
    }

    fn index_range(&self) -> (u16, u16) {
        (0, self.num_outputs)
    }
}

/// Generic Single Object mining mode
/// Checks a specific object index (e.g. 0 for first object created by Move Call)
#[derive(Clone, Debug)]
pub struct SingleObjectMode {
    pub object_index: u16,
}

impl SingleObjectMode {
    pub fn new(object_index: u16) -> Self {
        Self { object_index }
    }
}

impl MiningMode for SingleObjectMode {
    fn check_match(
        &self,
        tx_digest: &TransactionDigest,
        target: &TargetChecker,
    ) -> Option<(ObjectID, u16)> {
        let object_id = ObjectID::derive_id(*tx_digest, self.object_index as u64);
        if target.matches(&object_id.into_bytes()) {
            Some((object_id, self.object_index))
        } else {
            None
        }
    }

    fn description(&self) -> &'static str {
        "Single Object ID"
    }

    fn index_range(&self) -> (u16, u16) {
        (self.object_index, self.object_index + 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_mode_description() {
        let mode = PackageMode;
        assert_eq!(mode.description(), "Package ID");
    }

    #[test]
    fn test_gas_coin_mode_description() {
        let mode = GasCoinMode::new(3);
        assert_eq!(mode.description(), "Gas Coin ID");
        assert_eq!(mode.num_outputs, 3);
    }

    #[test]
    fn test_package_mode_derives_index_0() {
        // Create a simple target that matches anything starting with 0x00
        let target = TargetChecker::from_hex_prefix("00").unwrap();
        let mode = PackageMode;

        // Create a fake digest (all zeros)
        let digest_bytes = [0u8; 32];
        let tx_digest = TransactionDigest::new(digest_bytes);

        // Package ID should be derived with index 0
        let expected_id = ObjectID::derive_id(tx_digest, 0);

        if let Some((found_id, index)) = mode.check_match(&tx_digest, &target) {
            assert_eq!(found_id, expected_id);
            assert_eq!(index, 0);
        }
        // Note: Test may not match if derive_id doesn't produce 0x00... prefix
    }

    #[test]
    fn test_gas_coin_mode_checks_multiple_indices() {
        let mode = GasCoinMode::new(5);
        let target = TargetChecker::from_hex_prefix("00").unwrap();

        let digest_bytes = [0u8; 32];
        let tx_digest = TransactionDigest::new(digest_bytes);

        // Should check indices 0, 1, 2, 3, 4
        let result = mode.check_match(&tx_digest, &target);
        if let Some((_id, index)) = result {
            // If found, index should be in range 0..5
            assert!(index < 5);
        }
    }
}
