//! Mining configuration

/// Configuration for mining operations
#[derive(Clone, Debug)]
pub struct MinerConfig {
    /// Serialized transaction template
    pub tx_template: Vec<u8>,
    /// Offset in template where nonce is located
    pub nonce_offset: usize,
    /// Number of CPU threads (0 = auto-detect)
    pub threads: usize,
    /// Starting nonce value
    pub start_nonce: u64,
}

impl MinerConfig {
    pub fn new(tx_template: Vec<u8>, nonce_offset: usize, threads: usize) -> Self {
        Self {
            tx_template,
            nonce_offset,
            threads: if threads == 0 { num_cpus::get() } else { threads },
            start_nonce: 0,
        }
    }

    pub fn with_start_nonce(mut self, nonce: u64) -> Self {
        self.start_nonce = nonce;
        self
    }

    /// Extract base gas budget from template
    pub fn base_gas_budget(&self) -> u64 {
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&self.tx_template[self.nonce_offset..self.nonce_offset + 8]);
        u64::from_le_bytes(bytes)
    }
}
