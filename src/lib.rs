// Core mining library - WASM compatible
pub mod target;
pub mod types;
pub mod wasm_miner;

// Re-export for convenience
pub use target::TargetChecker;
pub use types::{MiningResult, MiningProgress};
pub use wasm_miner::{mine_chunk, WasmMiningResult};

// CPU miner only available when not in WASM
#[cfg(not(target_arch = "wasm32"))]
pub mod cpu_miner;
#[cfg(not(target_arch = "wasm32"))]
pub mod progress;
