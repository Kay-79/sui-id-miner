/// Target prefix checker for Package ID matching
#[derive(Debug, Clone)]
pub struct TargetChecker {
    prefix_bytes: Vec<u8>,
    prefix_len: usize,
}

impl TargetChecker {
    /// Create a new TargetChecker from hex prefix string
    /// The prefix should be without "0x" prefix
    pub fn from_hex_prefix(hex_prefix: &str) -> Result<Self, anyhow::Error> {
        // Handle odd-length hex strings by checking nibbles
        let prefix_len = hex_prefix.len();

        // Validate prefix length (max 64 hex chars = 32 bytes for a Sui Object ID)
        if prefix_len > 64 {
            anyhow::bail!("Prefix too long: {} chars (max 64)", prefix_len);
        }

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
    #[allow(dead_code)]
    pub fn prefix_bytes(&self) -> Vec<u8> {
        self.prefix_bytes.clone()
    }

    pub fn full_bytes(&self) -> usize {
        self.prefix_len / 2
    }

    pub fn has_half_byte(&self) -> bool {
        self.prefix_len % 2 == 1
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

    #[test]
    fn test_difficulty_calculation() {
        let checker1 = TargetChecker::from_hex_prefix("a").unwrap();
        assert_eq!(checker1.difficulty(), 1);

        let checker2 = TargetChecker::from_hex_prefix("abc").unwrap();
        assert_eq!(checker2.difficulty(), 3);

        let checker3 = TargetChecker::from_hex_prefix("dead").unwrap();
        assert_eq!(checker3.difficulty(), 4);
    }

    #[test]
    fn test_estimated_attempts() {
        let checker1 = TargetChecker::from_hex_prefix("0").unwrap();
        assert_eq!(checker1.estimated_attempts(), 16); // 16^1

        let checker2 = TargetChecker::from_hex_prefix("00").unwrap();
        assert_eq!(checker2.estimated_attempts(), 256); // 16^2

        let checker3 = TargetChecker::from_hex_prefix("face").unwrap();
        assert_eq!(checker3.estimated_attempts(), 65536); // 16^4
    }

    #[test]
    fn test_longer_prefix() {
        let checker = TargetChecker::from_hex_prefix("deadbeef").unwrap();
        assert_eq!(checker.difficulty(), 8);

        // Matching ID
        let mut id = [0u8; 32];
        id[0] = 0xde;
        id[1] = 0xad;
        id[2] = 0xbe;
        id[3] = 0xef;
        assert!(checker.matches(&id));

        // Non-matching ID
        id[3] = 0xee;
        assert!(!checker.matches(&id));
    }

    #[test]
    fn test_case_handled_properly() {
        // Prefix should work with uppercase input
        let checker_upper = TargetChecker::from_hex_prefix("FACE").unwrap();
        let checker_lower = TargetChecker::from_hex_prefix("face").unwrap();

        let mut id = [0u8; 32];
        id[0] = 0xfa;
        id[1] = 0xce;

        // Both should match (hex::decode handles both)
        assert!(checker_upper.matches(&id));
        assert!(checker_lower.matches(&id));
    }

    #[test]
    fn test_max_length_prefix() {
        // Full 64 chars (32 bytes)
        let full_prefix = "00".repeat(32);
        let checker = TargetChecker::from_hex_prefix(&full_prefix).unwrap();
        assert_eq!(checker.difficulty(), 64);
    }

    #[test]
    fn test_too_long_prefix_rejected() {
        let too_long = "0".repeat(65);
        let result = TargetChecker::from_hex_prefix(&too_long);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_hex_rejected() {
        let result = TargetChecker::from_hex_prefix("xyz");
        assert!(result.is_err());
    }
}
