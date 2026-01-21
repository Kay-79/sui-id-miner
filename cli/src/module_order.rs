//! Module ordering for multi-module packages
//!
//! Modules are already sorted alphabetically by the loader.
//! This matches the order that `sui client publish` uses.

use anyhow::Result;

/// Pass through modules without reordering.
/// Modules should already be sorted alphabetically by filename,
/// which matches the order used by `sui client publish`.
pub fn sort_modules_by_dependency(modules: Vec<Vec<u8>>) -> Result<Vec<Vec<u8>>> {
    // Already sorted by filename in load_module_bytes()
    // Just pass through without modification
    Ok(modules)
}
