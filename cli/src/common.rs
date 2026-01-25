use anyhow::{Context, Result};
use rand::Rng;
use rand::rngs::OsRng;
use sui_types::{
    base_types::{ObjectDigest, ObjectID, SequenceNumber, SuiAddress},
    programmable_transaction_builder::ProgrammableTransactionBuilder,
    transaction::{
        GasData, TransactionData, TransactionDataV1, TransactionExpiration, TransactionKind,
    },
};

pub fn format_large_number(n: u64) -> String {
    if n >= 1_000_000_000_000 {
        format!("{:.2}T", n as f64 / 1_000_000_000_000.0)
    } else if n >= 1_000_000_000 {
        format!("{:.2}B", n as f64 / 1_000_000_000.0)
    } else if n >= 1_000_000 {
        format!("{:.2}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.2}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

pub fn randomize_gas_budget(base_gas_budget: u64) -> (u64, u64) {
    let mut rng = OsRng;
    let extra_gas: u64 = rng.gen_range(0..100_000);
    let effective = base_gas_budget + extra_gas;
    (effective, extra_gas)
}

pub fn create_tx_template(
    sender: SuiAddress,
    module_bytes: Vec<Vec<u8>>,
    base_gas_budget: u64,
    gas_price: u64,
    gas_payment: (ObjectID, SequenceNumber, ObjectDigest),
) -> Result<(Vec<u8>, usize)> {
    use std::str::FromStr;

    let dependencies = vec![ObjectID::from_str("0x1")?, ObjectID::from_str("0x2")?];
    let mut ptb = ProgrammableTransactionBuilder::new();
    let upgrade_cap = ptb.publish_upgradeable(module_bytes, dependencies);
    ptb.transfer_arg(sender, upgrade_cap);
    let pt = ptb.finish();

    // Manually construct TransactionData to set Expiration
    // We use the expiration epoch as the "nonce" to crunch, preserving the gas budget

    // Gas Data with ACTUAL budget (passed in, potentially randomized)
    let gas_data = GasData {
        payment: vec![gas_payment],
        owner: sender,
        price: gas_price,
        budget: base_gas_budget,
    };

    // Placeholder Epoch for finding offset
    let placeholder_epoch = 0xAAAAAAAAAAAAAAAAu64;
    let expiration = TransactionExpiration::Epoch(placeholder_epoch);

    let kind = TransactionKind::ProgrammableTransaction(pt);

    let tx_data = TransactionData::V1(TransactionDataV1 {
        kind,
        sender,
        gas_data,
        expiration,
    });

    // Serialize
    let tx_bytes = bcs::to_bytes(&tx_data)?;

    // Find the epoch offset (look for our placeholder pattern)
    // TransactionExpiration::Epoch(u64) serializes as [variant_idx(1), u64(8)]
    // We look for the u64 bytes.
    let placeholder_bytes = placeholder_epoch.to_le_bytes();
    let nonce_offset = find_pattern(&tx_bytes, &placeholder_bytes)
        .context("Could not find expiration epoch placeholder in transaction bytes")?;

    Ok((tx_bytes, nonce_offset))
}

/// Create a SplitCoins transaction template for mining Gas Coin IDs
/// The transaction splits the gas coin into multiple new coins with specified amounts
/// Returns (tx_bytes, nonce_offset, num_outputs)
pub fn create_split_tx_template(
    sender: SuiAddress,
    split_amounts: Vec<u64>,
    gas_budget: u64,
    gas_price: u64,
    gas_payment: (ObjectID, SequenceNumber, ObjectDigest),
) -> Result<(Vec<u8>, usize, u16)> {
    let mut ptb = ProgrammableTransactionBuilder::new();

    // Split gas coin into multiple coins with specified amounts
    // Each amount creates a new coin object
    let amounts: Vec<_> = split_amounts
        .iter()
        .map(|a| ptb.pure(*a).unwrap())
        .collect();

    // SplitCoins from gas coin (Argument::GasCoin)
    let _new_coins = ptb.command(sui_types::transaction::Command::SplitCoins(
        sui_types::transaction::Argument::GasCoin,
        amounts,
    ));

    // Transfer all new coins to sender
    // new_coins is a vector result, we need to extract each one
    for i in 0..split_amounts.len() {
        let coin = sui_types::transaction::Argument::NestedResult(0, i as u16);
        ptb.transfer_arg(sender, coin);
    }

    let pt = ptb.finish();

    // Gas Data
    let gas_data = GasData {
        payment: vec![gas_payment],
        owner: sender,
        price: gas_price,
        budget: gas_budget,
    };

    // Placeholder Epoch for finding offset (same as package mining)
    let placeholder_epoch = 0xAAAAAAAAAAAAAAAAu64;
    let expiration = TransactionExpiration::Epoch(placeholder_epoch);

    let kind = TransactionKind::ProgrammableTransaction(pt);

    let tx_data = TransactionData::V1(TransactionDataV1 {
        kind,
        sender,
        gas_data,
        expiration,
    });

    // Serialize
    let tx_bytes = bcs::to_bytes(&tx_data)?;

    // Find the epoch offset
    let placeholder_bytes = placeholder_epoch.to_le_bytes();
    let nonce_offset = find_pattern(&tx_bytes, &placeholder_bytes)
        .context("Could not find expiration epoch placeholder in SplitCoins transaction bytes")?;

    // Number of new coins created = number of split amounts
    let num_outputs = split_amounts.len() as u16;

    Ok((tx_bytes, nonce_offset, num_outputs))
}

/// Create a mining template from existing transaction bytes
/// This is used for generic Move Calls or other transactions provided by the frontend
pub fn create_template_from_bytes(original_tx_bytes: &[u8]) -> Result<(Vec<u8>, usize)> {
    // Deserialize
    let tx_data: TransactionData =
        bcs::from_bytes(original_tx_bytes).context("Failed to deserialize transaction bytes")?;

    // Create placeholder epoch
    let placeholder_epoch = 0xAAAAAAAAAAAAAAAAu64;
    let expiration = TransactionExpiration::Epoch(placeholder_epoch);

    // Modify expiration in V1
    // Note: If Sui adds V2 in future, this needs update. Currently only V1 exists.
    let new_tx_data = match tx_data {
        TransactionData::V1(mut v1) => {
            v1.expiration = expiration;
            TransactionData::V1(v1)
        }
    };

    // Serialize
    let tx_bytes = bcs::to_bytes(&new_tx_data)?;

    // Find offset
    let placeholder_bytes = placeholder_epoch.to_le_bytes();
    let nonce_offset = find_pattern(&tx_bytes, &placeholder_bytes).context(
        "Could not find expiration epoch placeholder in re-serialized transaction bytes",
    )?;

    Ok((tx_bytes, nonce_offset))
}

fn find_pattern(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
