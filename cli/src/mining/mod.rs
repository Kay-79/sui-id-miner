//! Mining module - Core abstractions for ID mining
//!
//! This module provides trait-based abstractions to separate:
//! - Mining modes (Package ID vs Gas Coin ID) via `MiningMode` trait
//! - Execution backends (CPU, future GPU) via `MinerExecutor` trait

pub mod config;
pub mod executor;
pub mod mode;

pub use config::MinerConfig;
pub use executor::{CpuExecutor, MinerExecutor};
pub use mode::{GasCoinMode, PackageMode, SingleObjectMode};

#[cfg(feature = "gpu")]
pub mod gpu;

#[cfg(feature = "gpu")]
pub use gpu::GpuExecutor;
