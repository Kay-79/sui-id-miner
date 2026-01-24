// Core mining library
pub mod target;

// Re-export for convenience
pub use target::TargetChecker;

#[cfg(not(target_arch = "wasm32"))]
pub mod mining;
#[cfg(not(target_arch = "wasm32"))]
pub mod progress;

// Re-export new mining abstractions
#[cfg(not(target_arch = "wasm32"))]
pub use mining::{CpuExecutor, GasCoinMode, MinerConfig, MinerExecutor, PackageMode};
