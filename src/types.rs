use sui_types::{base_types::ObjectID, digests::TransactionDigest};

/// Result when a matching Package ID is found
#[derive(Debug, Clone)]
pub struct MiningResult {
    pub package_id: ObjectID,
    pub tx_digest: TransactionDigest,
    pub tx_bytes: Vec<u8>,
    pub nonce: u64,
    pub gas_budget_used: u64,
    pub attempts: u64,
}
