export type MiningMode = 'PACKAGE'

export interface FoundResult {
    // Common
    type?: 'PACKAGE'
    attempts: number
    timestamp: number

    // Package Mode
    packageId?: string
    txDigest?: string
    txBytesBase64?: string

    // Package Mode (Legacy WASM)
    package_id?: string
    tx_digest?: string
    tx_bytes_hex?: string
    nonce?: number
    gas_budget_used?: number
}

export interface MiningState {
    isRunning: boolean
    attempts: number
    hashrate: number
    startTime: number | null
    foundResults: FoundResult[]
}
