// Core mining library - WASM compatible
pub mod target;
pub mod wasm_miner;

// Re-export for convenience
pub use target::TargetChecker;
pub use wasm_miner::{WasmMiningResult, mine_chunk};

#[cfg(not(target_arch = "wasm32"))]
pub mod mining;
#[cfg(not(target_arch = "wasm32"))]
pub mod progress;

// Re-export new mining abstractions
#[cfg(not(target_arch = "wasm32"))]
pub use mining::{CpuExecutor, GasCoinMode, MinerConfig, MinerExecutor, PackageMode};
