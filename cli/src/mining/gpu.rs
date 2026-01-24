#[cfg(feature = "gpu")]
use crate::mining::MinerConfig;
#[cfg(feature = "gpu")]
use crate::mining::mode::MiningMode;
#[cfg(feature = "gpu")]
use crate::mining::mode::MiningResult;
#[cfg(feature = "gpu")]
use crate::target::TargetChecker;
#[cfg(feature = "gpu")]
use anyhow::Result;
#[cfg(feature = "gpu")]
use fastcrypto::hash::{Blake2b256, HashFunction};
#[cfg(feature = "gpu")]
use ocl::{MemFlags, ProQue, enums::DeviceInfo};
#[cfg(feature = "gpu")]
use std::sync::Arc;
#[cfg(feature = "gpu")]
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(feature = "gpu")]
use sui_types::base_types::ObjectID;
#[cfg(feature = "gpu")]
use sui_types::digests::TransactionDigest;
#[cfg(feature = "gpu")]
use sui_types::transaction::TransactionDataAPI;

#[cfg(feature = "gpu")]
pub struct GpuExecutor;

#[cfg(feature = "gpu")]
impl GpuExecutor {
    pub fn new() -> Self {
        Self
    }

    pub fn mine<M: MiningMode>(
        &self,
        mode: M,
        config: &MinerConfig,
        target: &TargetChecker,
        total_attempts: Arc<AtomicU64>,
        cancel: Arc<AtomicBool>,
    ) -> Result<Option<MiningResult>> {
        println!("   Initializing GPU...");

        let kernel_src = include_str!("kernel.cl");

        let builder_result = ProQue::builder()
            .src(kernel_src)
            .dims(config.threads * 1024)
            .build();

        let mut pro_que = match builder_result {
            Ok(pq) => pq,
            Err(e) => {
                println!("⚠️ OpenCL Build Failed!");
                return Err(anyhow::anyhow!("OpenCL Build Error: {}", e));
            }
        };

        let device = pro_que.device();
        let name = device.info(DeviceInfo::Name)?;
        println!("   Using Device: {}", name);

        let global_work_size = 1024 * 256;
        pro_que.set_dims((global_work_size,));

        // GPU Self-Check: BLAKE2b on "abc"
        {
            let test_input = b"abc";
            let test_in_buf = pro_que
                .buffer_builder::<u8>()
                .len(test_input.len())
                .flags(MemFlags::READ_ONLY | MemFlags::COPY_HOST_PTR)
                .copy_host_slice(test_input)
                .build()?;

            let test_out_buf = pro_que
                .buffer_builder::<u64>()
                .len(1)
                .flags(MemFlags::WRITE_ONLY)
                .build()?;

            let verify_kernel = pro_que
                .kernel_builder("verify_blake2b")
                .arg(&test_in_buf)
                .arg(test_input.len() as u32)
                .arg(&test_out_buf)
                .build()?;

            unsafe {
                verify_kernel.enq()?;
            }

            let mut gpu_result = vec![0u64; 1];
            test_out_buf.read(&mut gpu_result).enq()?;

            let cpu_digest = Blake2b256::digest(b"abc");
            let cpu_bytes = cpu_digest.as_ref();
            let expected_u64 = {
                let mut val = 0u64;
                for i in 0..8 {
                    val |= (cpu_bytes[i] as u64) << (i * 8);
                }
                val
            };

            if gpu_result[0] == expected_u64 {
                println!("✅ GPU Self-Check Passed: Blake2b hashing matches CPU");
            } else {
                println!(
                    "❌ GPU Self-Check Failed: Blake2b mismatch! GPU={:016x}, CPU={:016x}",
                    gpu_result[0], expected_u64
                );
                return Err(anyhow::anyhow!("GPU BLAKE2b verification failed"));
            }
        }

        // Prepare prefix bytes for hashing: "TransactionData::"
        // Sui TransactionDigest is Blake2b256("TransactionData::" || BCS(TransactionData))
        let intent_bytes = b"TransactionData::".to_vec();

        let intent_buf = pro_que
            .buffer_builder::<u8>()
            .len(intent_bytes.len())
            .flags(MemFlags::READ_ONLY | MemFlags::COPY_HOST_PTR)
            .copy_host_slice(&intent_bytes)
            .build()?;

        // --- Canonicalize Template Logic (Run Once) ---
        let mut working_template = config.tx_template.clone();
        let mut working_offset = config.nonce_offset;

        // Shadow base_budget scope to check canonicalization (but actual base_budget used in loop is from config)
        if let Ok(mut tx_data) =
            bcs::from_bytes::<sui_types::transaction::TransactionData>(&working_template)
        {
            let nonce_bytes_in_template = &working_template[working_offset..working_offset + 8];
            let nonce_val_in_template =
                u64::from_le_bytes(nonce_bytes_in_template.try_into().unwrap());

            if nonce_val_in_template == tx_data.gas_data().budget {
                println!("   Detected Gas Budget Mining. Canonicalizing template...");
                let magic_marker: u64 = 0x1122334455667788;
                let original_budget = tx_data.gas_data().budget;

                match &mut tx_data {
                    sui_types::transaction::TransactionData::V1(v1) => {
                        v1.gas_data.budget = magic_marker;
                    }
                }

                if let Ok(canonical_bytes_with_marker) = bcs::to_bytes(&tx_data) {
                    if let Some(pos) = canonical_bytes_with_marker
                        .windows(8)
                        .position(|w| w == magic_marker.to_le_bytes())
                    {
                        println!(
                            "   Canonicalization Success. Offset adjusted: {} -> {}",
                            working_offset, pos
                        );
                        working_offset = pos;

                        match &mut tx_data {
                            sui_types::transaction::TransactionData::V1(v1) => {
                                v1.gas_data.budget = original_budget;
                            }
                        }
                        if let Ok(final_canonical_bytes) = bcs::to_bytes(&tx_data) {
                            working_template = final_canonical_bytes;
                        }
                    } else {
                        println!(
                            "⚠️ Failed to locate marker in canonical bytes. Skipping canonicalization."
                        );
                    }
                }
            }
        }
        // ----------------------------------------------

        let tx_buf = pro_que
            .buffer_builder::<u8>()
            .len(working_template.len())
            .flags(MemFlags::READ_ONLY | MemFlags::COPY_HOST_PTR)
            .copy_host_slice(&working_template)
            .build()?;

        let target_bytes = target.prefix_bytes();
        let target_buf = pro_que
            .buffer_builder::<u8>()
            .len(target_bytes.len())
            .flags(MemFlags::READ_ONLY | MemFlags::COPY_HOST_PTR)
            .copy_host_slice(&target_bytes)
            .build()?;

        let results_count_buf = pro_que
            .buffer_builder::<u32>()
            .len(1)
            .flags(MemFlags::READ_WRITE)
            .build()?;

        // Results: nonce + start_index + 4x tx_digest (6 u64s total)
        let results_buf = pro_que
            .buffer_builder::<u64>()
            .len(10 * 6)
            .flags(MemFlags::READ_WRITE)
            .build()?;

        let (start_index_16, end_index_16) = mode.index_range();
        let start_index = start_index_16 as u32;
        let end_index = end_index_16 as u32;

        println!(
            "   GPU mining started using work size: {}",
            global_work_size
        );

        let base_budget = config.base_gas_budget();
        let mut current_nonce = config.start_nonce;

        // Enforce a minimum gas budget to prevent "InsufficientGas" errors on submission.
        // Mining low budgets (e.g. < 0.002 SUI) produces valid IDs that cannot be published.
        const MIN_GAS_BUDGET: u64 = 2_000_000; // 0.002 SUI
        if base_budget.saturating_add(current_nonce) < MIN_GAS_BUDGET {
            let needed_offset = MIN_GAS_BUDGET.saturating_sub(base_budget);
            if needed_offset > current_nonce {
                println!(
                    "   ⚠️ Enforcing Min Gas Budget: Bumped start nonce to {} (Total Budget: {})",
                    needed_offset,
                    base_budget + needed_offset
                );
                current_nonce = needed_offset;
            }
        }
        let full_bytes = target.full_bytes() as u32;
        let has_half_byte = if target.has_half_byte() { 1i32 } else { 0i32 };

        let mut results_count = vec![0u32; 1];
        let mut found_results = vec![0u64; 10 * 6];

        loop {
            if cancel.load(Ordering::Relaxed) {
                return Ok(None);
            }

            results_count[0] = 0;
            results_count_buf.write(&results_count).enq()?;

            let kernel = pro_que
                .kernel_builder("mine_sui_id")
                .arg(&intent_buf)
                .arg(&tx_buf)
                .arg(&target_buf)
                .arg(&results_count_buf)
                .arg(&results_buf)
                .arg(current_nonce.wrapping_add(base_budget))
                .arg(intent_bytes.len() as u32)
                .arg(working_template.len() as u32)
                .arg(working_offset as u32)
                .arg(start_index)
                .arg(end_index)
                .arg(full_bytes)
                .arg(has_half_byte)
                .build()?;

            // Need to rebuild buffers with working_template
            // The `tx_buf` previously built used `config.tx_template`. We need to rebuild it if it changed.
            // Actually, buffers are built BEFORE kernel. We must move this logic UP or rebuild buffers.
            // Moving Logic UP before buffer creation.

            unsafe {
                kernel.enq()?;
            }

            results_count_buf.read(&mut results_count).enq()?;

            total_attempts.fetch_add(global_work_size as u64, Ordering::Relaxed);

            if results_count[0] > 0 {
                results_buf.read(&mut found_results).enq()?;

                let nonce = found_results[0];
                let matching_index = found_results[1] as u16;

                // Reconstruct transaction bytes with the found nonce
                let mut tx_bytes = working_template.clone();
                tx_bytes[working_offset..working_offset + 8].copy_from_slice(&nonce.to_le_bytes());

                // CPU-side verification using standard Sui Types
                // This mimics CpuExecutor logic exactly to ensure 100% correctness on chain
                if let Ok(tx_data) =
                    bcs::from_bytes::<sui_types::transaction::TransactionData>(&tx_bytes)
                {
                    let tx_digest = tx_data.digest();

                    // Derive Object ID
                    let object_id = ObjectID::derive_id(tx_digest, matching_index as u64);
                    let object_id_bytes = object_id.into_bytes();

                    if target.matches(&object_id_bytes) {
                        return Ok(Some(MiningResult {
                            object_id,
                            object_index: matching_index,
                            tx_digest,
                            tx_bytes,
                            nonce: nonce.wrapping_sub(base_budget),
                            gas_budget_used: nonce,
                            attempts: nonce
                                .wrapping_sub(base_budget)
                                .saturating_sub(config.start_nonce),
                        }));
                    } else {
                        // Strict CPU check failed. The template might be non-canonical.
                        // Check if the RAW bytes produce the valid target.

                        let mut hasher = Blake2b256::default();
                        hasher.update(&[0, 0, 0]); // Intent
                        hasher.update(&tx_bytes);
                        let direct_digest_bytes = hasher.finalize();
                        let direct_digest = TransactionDigest::new(direct_digest_bytes.into());

                        // Re-derive Object ID from raw digest
                        let raw_object_id =
                            ObjectID::derive_id(direct_digest, matching_index as u64);

                        if target.matches(&raw_object_id.into_bytes()) {
                            // This is a valid result if we just sign the raw bytes!
                            // The CPU re-serialization check failed, but the raw bytes work.
                            println!("✅ GPU Validated via Raw Bytes. Result Found.");
                            return Ok(Some(MiningResult {
                                object_id: raw_object_id,
                                object_index: matching_index,
                                tx_digest: direct_digest,
                                tx_bytes,
                                nonce: nonce.wrapping_sub(base_budget),
                                gas_budget_used: nonce,
                                attempts: nonce
                                    .wrapping_sub(base_budget)
                                    .saturating_sub(config.start_nonce),
                            }));
                        }

                        eprintln!(
                            "⚠️ GPU match verification failed on CPU! Possible hash/input mismatch."
                        );
                    }
                } else {
                    // Fallback: Direct Raw Hash Verification
                    // If BCS deserialization fails or produces a different hash (due to normalization),
                    // we check if the RAW bytes hash matches the GPU hash.

                    let mut hasher = Blake2b256::default();
                    hasher.update(&[0, 0, 0]); // Intent
                    hasher.update(&tx_bytes);
                    let direct_digest_bytes = hasher.finalize();
                    let direct_digest = TransactionDigest::new(direct_digest_bytes.into());

                    // Check if GPU digest matches our raw digest
                    let mut gpu_tx_digest_bytes = [0u8; 32];
                    for w in 0..4 {
                        let val = found_results[2 + w];
                        for b in 0..8 {
                            gpu_tx_digest_bytes[w * 8 + b] = ((val >> (b * 8)) & 0xFF) as u8;
                        }
                    }

                    if gpu_tx_digest_bytes == *direct_digest.inner() {
                        // The GPU did its job correctly on the bytes provided.
                        // Now check if this raw digest produces the target Object ID.
                        let object_id = ObjectID::derive_id(direct_digest, matching_index as u64);
                        let object_id_bytes = object_id.into_bytes();

                        if target.matches(&object_id_bytes) {
                            println!(
                                "⚠️ GPU Verification: BCS Mismatch but Raw Hash Valid. Returning Result."
                            );
                            return Ok(Some(MiningResult {
                                object_id,
                                object_index: matching_index,
                                tx_digest: direct_digest,
                                tx_bytes,
                                nonce: nonce.wrapping_sub(base_budget),
                                gas_budget_used: nonce,
                                attempts: nonce
                                    .wrapping_sub(base_budget)
                                    .saturating_sub(config.start_nonce),
                            }));
                        } else {
                            eprintln!(
                                "⚠️ GPU Raw Hash verified, but Target NOT matched. False Positive."
                            );
                        }
                    } else {
                        eprintln!(
                            "⚠️ GPU vs CPU Raw Hash Mismatch! GPU={:?}, CPU={:?}",
                            hex::encode(gpu_tx_digest_bytes),
                            hex::encode(direct_digest.inner())
                        );
                    }
                }
            }

            current_nonce = current_nonce.wrapping_add(global_work_size as u64);
        }
    }
}

#[cfg(test)]
#[cfg(feature = "gpu")]
mod tests {
    use super::*;
    use fastcrypto::hash::{Blake2b256, HashFunction};
    use ocl::{MemFlags, ProQue};

    #[test]
    fn test_gpu_blake2b_verification() -> Result<()> {
        println!("Initializing GPU for Blake2b Test...");
        let kernel_src = include_str!("kernel.cl");

        let pro_que = ProQue::builder()
            .src(kernel_src)
            .dims(1)
            .build()
            .map_err(|e| anyhow::anyhow!("OpenCL Build Error: {}", e))?;

        let device = pro_que.device();
        println!(
            "Testing on Device: {}",
            device.info(ocl::enums::DeviceInfo::Name)?
        );

        let test_input = b"abc";
        let test_in_buf = pro_que
            .buffer_builder::<u8>()
            .len(test_input.len())
            .flags(MemFlags::READ_ONLY | MemFlags::COPY_HOST_PTR)
            .copy_host_slice(test_input)
            .build()?;

        let test_out_buf = pro_que
            .buffer_builder::<u64>()
            .len(1)
            .flags(MemFlags::WRITE_ONLY)
            .build()?;

        let verify_kernel = pro_que
            .kernel_builder("verify_blake2b")
            .arg(&test_in_buf)
            .arg(test_input.len() as u32)
            .arg(&test_out_buf)
            .build()?;

        unsafe {
            verify_kernel.enq()?;
        }

        let mut gpu_result = vec![0u64; 1];
        test_out_buf.read(&mut gpu_result).enq()?;

        let cpu_digest = Blake2b256::digest(b"abc");
        let cpu_bytes = cpu_digest.as_ref();
        let expected_u64 = {
            let mut val = 0u64;
            for i in 0..8 {
                val |= (cpu_bytes[i] as u64) << (i * 8);
            }
            val
        };

        println!(
            "✅ GPU Blake2b('abc'): GPU={:016x}, CPU={:016x}",
            gpu_result[0], expected_u64
        );

        assert_eq!(gpu_result[0], expected_u64, "GPU Blake2b mismatch!");
        Ok(())
    }

    #[test]
    fn test_gpu_sha3_known() -> Result<()> {
        println!("Testing GPU SHA3-256 (known 40 bytes)...");
        let kernel_src = include_str!("kernel.cl");

        let pro_que = ProQue::builder()
            .src(kernel_src)
            .dims(1)
            .build()
            .map_err(|e| anyhow::anyhow!("OpenCL Build Error: {}", e))?;

        // Calculate Expected
        let mut data = Vec::new();
        for i in 0..40 {
            data.push(i as u8);
        }
        let cpu_digest = fastcrypto::hash::Sha3_256::digest(&data);
        let cpu_bytes = cpu_digest.as_ref();

        let in_buf = pro_que
            .buffer_builder::<u8>()
            .len(data.len())
            .copy_host_slice(&data)
            .flags(MemFlags::READ_ONLY)
            .build()?;

        let out_buf = pro_que
            .buffer_builder::<u64>()
            .len(4)
            .flags(MemFlags::WRITE_ONLY)
            .build()?;

        let kernel = pro_que
            .kernel_builder("test_sha3_known")
            .arg(&in_buf)
            .arg(&out_buf)
            .build()?;

        unsafe {
            kernel.enq()?;
        }

        let mut gpu_result = vec![0u64; 4];
        out_buf.read(&mut gpu_result).enq()?;

        println!("CPU Digest: {:?}", hex::encode(cpu_bytes));

        let mut gpu_digest_bytes = [0u8; 32];
        for w in 0..4 {
            let val = gpu_result[w];
            for b in 0..8 {
                gpu_digest_bytes[w * 8 + b] = ((val >> (b * 8)) & 0xFF) as u8;
            }
        }
        println!("GPU Digest: {:?}", hex::encode(gpu_digest_bytes));

        assert_eq!(
            gpu_digest_bytes, cpu_bytes,
            "GPU SHA3-256(40 bytes) mismatch!"
        );
        println!("✅ GPU SHA3-256(40 bytes) passed!");
        Ok(())
    }

    #[test]
    fn test_cpu_gpu_consistency() -> Result<()> {
        println!("Testing CPU vs GPU Consistency...");

        // 1. Setup Data
        let intent = b"TransactionData::".to_vec();
        let mut template = vec![0u8; 64];
        // Fill template with some data
        for i in 0..64 {
            template[i] = i as u8;
        }

        let nonce_offset = 32;
        let base_gas_budget = 1000;
        let start_nonce: u64 = 12345678; // Arbitrary

        // Calculate expected Nonce value
        // CPU logic: varied = base + (start + i)
        // Let's test i=0
        let nonce_val = base_gas_budget + start_nonce;

        // 2. Compute CPU Hash (BLAKE2b) - Match GPU kernel logic
        // GPU calculates: BLAKE2b(intent || template[0..nonce_offset] || nonce || template[after_nonce..])
        let nonce_bytes = nonce_val.to_le_bytes();
        let mut full_input = intent.clone();
        full_input.extend_from_slice(&template[0..nonce_offset]);
        full_input.extend_from_slice(&nonce_bytes);
        full_input.extend_from_slice(&template[nonce_offset + 8..]);

        let cpu_digest = Blake2b256::digest(&full_input);
        println!("CPU Digest: {:?}", hex::encode(cpu_digest));

        // 3. Compute CPU Derived ID (SHA3-256(digest || index))
        // Let's use index 0
        let index = 0u64;
        let object_id = ObjectID::derive_id(TransactionDigest::new(cpu_digest.into()), index);
        let object_id_bytes = object_id.into_bytes();
        println!("CPU Object ID: {:?}", hex::encode(object_id_bytes));

        // 4. Setup GPU to mine EXACTLY this nonce
        // To ensure GPU returns it, we need to set a Target that matches this Object ID.
        // We can just use the first byte of the Object ID as target.
        let target_prefix_hex = hex::encode(&object_id_bytes[0..1]); // first byte
        let target = TargetChecker::from_hex_prefix(&target_prefix_hex)?;
        let target_bytes = target.prefix_bytes();

        // Kernel Config
        // GPU calculates nonce = start_nonce + gid
        // We want nonce to be `nonce_val`.
        // Kernel: `current_nonce = config.start_nonce.wrapping_add(base_budget)`.
        // Kernel: `nonce = current_nonce + gid`.
        // So `nonce_val = config.start_nonce + base_budget + gid`.
        // We use gid=0 (work size 1).
        // So `nonce_val = config.start_nonce + base_budget`.
        // `config.start_nonce` should be `start_nonce`.
        // `config.base_gas_budget` (passed from CPU wrapper) is `base_gas_budget`.
        // This matches.

        let kernel_src = include_str!("kernel.cl");
        let pro_que = ProQue::builder()
            .src(kernel_src)
            .dims(1) // Single thread
            .build()?;

        let device = pro_que.device();
        println!("GPU Device: {}", device.info(DeviceInfo::Name)?);

        // Buffers
        let intent_buf = pro_que
            .buffer_builder::<u8>()
            .len(intent.len())
            .copy_host_slice(&intent)
            .flags(MemFlags::READ_ONLY)
            .build()?;
        let tx_buf = pro_que
            .buffer_builder::<u8>()
            .len(template.len())
            .copy_host_slice(&template)
            .flags(MemFlags::READ_ONLY)
            .build()?;
        let target_buf = pro_que
            .buffer_builder::<u8>()
            .len(target_bytes.len())
            .copy_host_slice(&target_bytes)
            .flags(MemFlags::READ_ONLY)
            .build()?;
        let results_count_buf = pro_que
            .buffer_builder::<u32>()
            .len(1)
            .flags(MemFlags::READ_WRITE)
            .build()?;
        let results_buf = pro_que
            .buffer_builder::<u64>()
            .len(60)
            .flags(MemFlags::READ_WRITE)
            .build()?;

        // Reset count
        let zero = vec![0u32];
        results_count_buf.write(&zero).enq()?;

        // Kernel Args
        // __constant uint8_t *intent_bytes, uint32_t intent_len,
        // __constant uint8_t *tx_template, uint32_t tx_len,
        // uint32_t nonce_offset,
        // uint64_t start_nonce, -> This is `current_nonce` passed from loop, which is `start + base`
        // uint32_t start_index,
        // uint32_t end_index,
        // __constant uint8_t *target_prefix,
        // uint32_t target_len,
        // __global uint32_t *results_count,
        // __global uint64_t *results

        let current_nonce_arg = start_nonce + base_gas_budget;

        let full_bytes = target.full_bytes() as u32;
        let has_half_byte = if target.has_half_byte() { 1i32 } else { 0i32 };

        let kernel = pro_que
            .kernel_builder("mine_sui_id")
            .arg(&intent_buf)
            .arg(&tx_buf)
            .arg(&target_buf)
            .arg(&results_count_buf)
            .arg(&results_buf)
            .arg(current_nonce_arg)
            .arg(intent.len() as u32)
            .arg(template.len() as u32)
            .arg(nonce_offset as u32)
            .arg(0u32) // start index
            .arg(1u32) // end index
            .arg(full_bytes)
            .arg(has_half_byte)
            .build()?;

        unsafe {
            kernel.enq()?;
        }

        // Read Result
        let mut count = vec![0u32];
        results_count_buf.read(&mut count).enq()?;
        println!("GPU Results Count: {}", count[0]);

        if count[0] == 0 {
            // This is bad, GPU didn't find the match that CPU calculated!
            // Means GPU calculation is WRONG (either BLAKE2b or SHA3 or Prefix Check)
            return Err(anyhow::anyhow!(
                "GPU failed to find hash that CPU predicted!"
            ));
        }

        let mut results = vec![0u64; 60];
        results_buf.read(&mut results).enq()?;

        // Check returned TX Digest (kernel now outputs tx_digest not object_id)
        let mut gpu_tx_digest_bytes = [0u8; 32];
        for w in 0..4 {
            let val = results[2 + w];
            for b in 0..8 {
                gpu_tx_digest_bytes[w * 8 + b] = ((val >> (b * 8)) & 0xFF) as u8;
            }
        }
        println!("GPU TX Digest: {:?}", hex::encode(gpu_tx_digest_bytes));

        // Now compute what the object_id SHOULD be from the returned tx_digest
        let gpu_tx_digest_obj = ObjectID::derive_id(TransactionDigest::new(gpu_tx_digest_bytes), 0);
        let gpu_object_id_from_digest = gpu_tx_digest_obj.into_bytes();
        println!(
            "GPU Derived Object ID: {:?}",
            hex::encode(gpu_object_id_from_digest)
        );
        println!("CPU Object ID: {:?}", hex::encode(object_id_bytes));

        assert_eq!(
            gpu_tx_digest_bytes,
            cpu_digest.as_ref(),
            "GPU TX Digest mismatch!"
        );

        assert_eq!(
            gpu_object_id_from_digest, object_id_bytes,
            "GPU Derived Object ID mismatch!"
        );

        println!("✅ CPU vs GPU Digest and Object ID Match!");

        Ok(())
    }

    #[test]
    fn test_gpu_no_prefix_filter() -> Result<()> {
        println!("Testing GPU with no prefix filtering...");

        // 1. Setup Data
        let intent = vec![0u8, 0u8, 0u8];
        let mut template = vec![0u8; 64];
        for i in 0..64 {
            template[i] = i as u8;
        }

        let nonce_offset = 32;
        let base_gas_budget = 1000;
        let start_nonce: u64 = 12345678;
        let nonce_val = base_gas_budget + start_nonce;

        // 2. Compute CPU Hash (BLAKE2b) - Match GPU kernel logic
        let nonce_bytes = nonce_val.to_le_bytes();
        let mut full_input = intent.clone();
        full_input.extend_from_slice(&template[0..nonce_offset]);
        full_input.extend_from_slice(&nonce_bytes);
        full_input.extend_from_slice(&template[nonce_offset + 8..]);

        let cpu_digest = Blake2b256::digest(&full_input);
        println!("CPU Digest: {:?}", hex::encode(cpu_digest));

        // 3. Setup GPU
        let kernel_src = include_str!("kernel.cl");
        let pro_que = ProQue::builder()
            .src(kernel_src)
            .dims(1) // Single thread
            .build()?;

        let device = pro_que.device();
        println!("GPU Device: {}", device.info(DeviceInfo::Name)?);

        // Buffers
        let intent_buf = pro_que
            .buffer_builder::<u8>()
            .len(intent.len())
            .copy_host_slice(&intent)
            .flags(MemFlags::READ_ONLY)
            .build()?;
        let tx_buf = pro_que
            .buffer_builder::<u8>()
            .len(template.len())
            .copy_host_slice(&template)
            .flags(MemFlags::READ_ONLY)
            .build()?;

        // Empty target prefix - will always match
        let target_buf = pro_que
            .buffer_builder::<u8>()
            .len(1)
            .copy_host_slice(&[0u8])
            .flags(MemFlags::READ_ONLY)
            .build()?;

        let results_count_buf = pro_que
            .buffer_builder::<u32>()
            .len(1)
            .flags(MemFlags::READ_WRITE)
            .build()?;
        let results_buf = pro_que
            .buffer_builder::<u64>()
            .len(60)
            .flags(MemFlags::READ_WRITE)
            .build()?;

        // Reset count
        let zero = vec![0u32];
        results_count_buf.write(&zero).enq()?;

        let current_nonce_arg = start_nonce + base_gas_budget;

        let kernel = pro_que
            .kernel_builder("mine_sui_id")
            .arg(&intent_buf)
            .arg(&tx_buf)
            .arg(&target_buf)
            .arg(&results_count_buf)
            .arg(&results_buf)
            .arg(current_nonce_arg)
            .arg(intent.len() as u32)
            .arg(template.len() as u32)
            .arg(nonce_offset as u32)
            .arg(0u32) // start index
            .arg(1u32) // end index
            .arg(0u32) // full_bytes = 0
            .arg(0i32) // has_half_byte = false
            .build()?;

        unsafe {
            kernel.enq()?;
        }

        // Read Result
        let mut count = vec![0u32];
        results_count_buf.read(&mut count).enq()?;
        println!("GPU Results Count: {}", count[0]);

        if count[0] == 0 {
            return Err(anyhow::anyhow!(
                "GPU failed to output any result (target_len=0 should match all)!"
            ));
        }

        let mut results = vec![0u64; 60];
        results_buf.read(&mut results).enq()?;

        // Check returned TX Digest
        let mut gpu_digest_bytes = [0u8; 32];
        for w in 0..4 {
            let val = results[2 + w];
            for b in 0..8 {
                gpu_digest_bytes[w * 8 + b] = ((val >> (b * 8)) & 0xFF) as u8;
            }
        }
        println!("GPU TX Digest: {:?}", hex::encode(gpu_digest_bytes));

        assert_eq!(
            gpu_digest_bytes,
            cpu_digest.as_ref(),
            "GPU BLAKE2b Digest mismatch (no prefix filter)!"
        );
        println!("✅ CPU vs GPU BLAKE2b Match (no prefix filter)!");

        Ok(())
    }

    #[test]
    fn test_blake2b_kernel_simple() -> Result<()> {
        println!("Testing BLAKE2b kernel with simple input...");

        // Use a simple 64-byte input = [0, 1, 2, ..., 63]
        let input = (0..64).map(|i| i as u8).collect::<Vec<u8>>();

        let kernel_src = include_str!("kernel.cl");
        let pro_que = ProQue::builder().src(kernel_src).dims(1).build()?;

        let device = pro_que.device();
        println!("GPU Device: {}", device.info(DeviceInfo::Name)?);

        // Input buffer
        let input_buf = pro_que
            .buffer_builder::<u8>()
            .len(input.len())
            .copy_host_slice(&input)
            .flags(MemFlags::READ_ONLY)
            .build()?;

        // Output buffer for digest (32 bytes = 4 u64s)
        let output_buf = pro_que
            .buffer_builder::<u64>()
            .len(4)
            .flags(MemFlags::WRITE_ONLY)
            .build()?;

        // Call verify_blake2b kernel (it hashes input and returns first 32 bytes as 4 u64s)
        let kernel = pro_que
            .kernel_builder("verify_blake2b")
            .arg(&input_buf)
            .arg(input.len() as u32)
            .arg(&output_buf)
            .build()?;

        unsafe {
            kernel.enq()?;
        }

        // Read result
        let mut gpu_result = vec![0u64; 4];
        output_buf.read(&mut gpu_result).enq()?;

        // Compute CPU hash
        let cpu_digest = Blake2b256::digest(&input);
        let cpu_bytes = cpu_digest.as_ref();

        // Convert GPU result (4 u64s in LE) to bytes
        let mut gpu_bytes = [0u8; 32];
        for w in 0..4 {
            let val = gpu_result[w];
            for b in 0..8 {
                gpu_bytes[w * 8 + b] = ((val >> (b * 8)) & 0xFF) as u8;
            }
        }

        println!("CPU BLAKE2b: {:?}", hex::encode(cpu_bytes));
        println!("GPU BLAKE2b: {:?}", hex::encode(gpu_bytes));

        assert_eq!(gpu_bytes, cpu_bytes, "BLAKE2b kernel digest mismatch!");
        println!("✅ BLAKE2b Kernel Test Passed!");

        Ok(())
    }

    #[test]
    fn test_gpu_blake2b_sizes() -> Result<()> {
        println!("Testing GPU Blake2b with multiple sizes...");
        let kernel_src = include_str!("kernel.cl");
        let pro_que = ProQue::builder().src(kernel_src).dims(1).build()?;

        let sizes = vec![0, 1, 64, 127, 128, 129, 255, 256, 257];

        for &size in &sizes {
            let input = vec![0x42u8; size];
            let in_buf = if size > 0 {
                pro_que
                    .buffer_builder::<u8>()
                    .len(size)
                    .copy_host_slice(&input)
                    .build()?
            } else {
                pro_que.buffer_builder::<u8>().len(1).build()?
            };
            let out_buf = pro_que.buffer_builder::<u64>().len(4).build()?;
            let kernel = pro_que
                .kernel_builder("verify_blake2b")
                .arg(&in_buf)
                .arg(size as u32)
                .arg(&out_buf)
                .build()?;

            unsafe {
                kernel.enq()?;
            }

            let mut gpu_res = vec![0u64; 4];
            out_buf.read(&mut gpu_res).enq()?;

            let mut gpu_bytes = [0u8; 32];
            for i in 0..4 {
                gpu_bytes[i * 8..(i + 1) * 8].copy_from_slice(&gpu_res[i].to_le_bytes());
            }

            let cpu_digest = Blake2b256::digest(&input);
            println!(
                "Size {}: CPU={}, GPU={}",
                size,
                hex::encode(cpu_digest),
                hex::encode(gpu_bytes)
            );
            assert_eq!(gpu_bytes, cpu_digest.as_ref(), "Mismatch at size {}", size);
        }

        println!("✅ All GPU Blake2b sizes passed!");
        Ok(())
    }
}
