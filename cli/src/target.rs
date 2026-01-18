/// Target prefix checker for Package ID matching
#[derive(Debug, Clone)]
pub struct TargetChecker {
    prefix_bytes: Vec<u8>,
    prefix_len: usize,
}

impl TargetChecker {
    /// Create a new TargetChecker from hex prefix string
    /// The prefix should be without "0x" prefix
    pub fn from_hex_prefix(hex_prefix: &str) -> Result<Self, hex::FromHexError> {
        // Handle odd-length hex strings by checking nibbles
        let prefix_len = hex_prefix.len();
        
        // Pad with 0 if odd length for hex decoding
        let padded = if prefix_len % 2 == 1 {
            format!("{}0", hex_prefix)
        } else {
            hex_prefix.to_string()
        };
        
        let prefix_bytes = hex::decode(&padded)?;
        
        Ok(Self {
            prefix_bytes,
            prefix_len,
        })
    }

    /// Check if the given 32-byte ID matches the target prefix
    #[inline(always)]
    pub fn matches(&self, id_bytes: &[u8; 32]) -> bool {
        // Number of full bytes to compare
        let full_bytes = self.prefix_len / 2;
        
        // Compare full bytes
        if full_bytes > 0 && id_bytes[..full_bytes] != self.prefix_bytes[..full_bytes] {
            return false;
        }
        
        // If odd number of hex chars, check the high nibble of the next byte
        if self.prefix_len % 2 == 1 {
            let expected_nibble = self.prefix_bytes[full_bytes] >> 4;
            let actual_nibble = id_bytes[full_bytes] >> 4;
            return expected_nibble == actual_nibble;
        }
        
        true
    }

    /// Get the difficulty (number of hex characters to match)
    pub fn difficulty(&self) -> usize {
        self.prefix_len
    }

    /// Estimate attempts needed (average case)
    pub fn estimated_attempts(&self) -> u64 {
        // Each hex char = 4 bits = 16 possibilities
        16u64.pow(self.prefix_len as u32)
    }

    /// Get the raw prefix bytes for GPU matching
    pub fn prefix_bytes(&self) -> Vec<u8> {
        self.prefix_bytes.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prefix_match() {
        let checker = TargetChecker::from_hex_prefix("00").unwrap();
        
        let mut id = [0u8; 32];
        assert!(checker.matches(&id));
        
        id[0] = 0x01;
        assert!(!checker.matches(&id));
    }

    #[test]
    fn test_odd_prefix() {
        let checker = TargetChecker::from_hex_prefix("0").unwrap();
        
        let mut id = [0u8; 32];
        id[0] = 0x0F; // High nibble is 0
        assert!(checker.matches(&id));
        
        id[0] = 0x10; // High nibble is 1
        assert!(!checker.matches(&id));
    }
}
