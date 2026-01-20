export type MiningMode = 'PACKAGE' | 'GAS_COIN'

export interface FoundResult {
    // Common
    type?: 'PACKAGE' | 'GAS_COIN'
    attempts: number
    timestamp: number
    txDigest?: string
    txBytesBase64?: string
    gasObjectId?: string
    gasObjectVersion?: string

    // Package Mode
    packageId?: string

    // Gas Coin Mode
    objectId?: string
    objectIndex?: number
    splitAmounts?: number[]

    // Legacy fields (WASM)
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

