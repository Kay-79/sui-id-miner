export type MiningMode = 'PACKAGE' | 'ADDRESS'

export interface FoundResult {
    // Common
    type?: 'ADDRESS' | 'PACKAGE'
    attempts: number
    timestamp: number

    // Address Mode
    address?: string
    private_key?: string
    public_key?: string

    // Package Mode (WebSocket)
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
