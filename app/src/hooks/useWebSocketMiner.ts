// WebSocket Miner Hook - Connects to local sui-id-miner server

import { useState, useRef, useCallback, useEffect } from 'react'

interface PackageMiningConfig {
    prefix: string
    modulesBase64: string[]
    sender: string
    gasBudget: number
    gasPrice: number
    gasObjectId: string
    gasObjectVersion: string
    gasObjectDigest: string
    threads?: number
    nonceOffset?: number // Resume from this nonce
}

interface AddressMiningConfig {
    prefix: string
    threads?: number
}

interface PackageResult {
    packageId: string
    txDigest: string
    txBytesBase64: string
    attempts: number
    gasBudgetUsed: number
}

interface AddressResult {
    address: string
    privateKey: string
    publicKey: string
    attempts: number
}

export interface MiningProgress {
    attempts: number
    hashrate: number
}

interface UseWebSocketMinerReturn {
    isConnected: boolean
    isRunning: boolean
    progress: MiningProgress | null
    packageResult: PackageResult | null
    addressResult: AddressResult | null
    error: string | null
    lastNonce: number // For resume functionality
    lastEpoch: string // Current mining epoch
    resetNonce: () => void // Reset nonce for new mining session
    connect: (port?: number) => void
    disconnect: () => void
    startPackageMining: (config: PackageMiningConfig) => void
    startAddressMining: (config: AddressMiningConfig) => void
    stopMining: () => void
}

export function useWebSocketMiner(): UseWebSocketMinerReturn {
    const [isConnected, setIsConnected] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [progress, setProgress] = useState<MiningProgress | null>(null)
    const [packageResult, setPackageResult] = useState<PackageResult | null>(null)
    const [addressResult, setAddressResult] = useState<AddressResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [lastNonce, setLastNonce] = useState(0)
    const [lastEpoch, setLastEpoch] = useState('') // Epoch = gas digest (changes with new version)

    const wsRef = useRef<WebSocket | null>(null)

    // Reset nonce for new mining session
    const resetNonce = useCallback(() => {
        setLastNonce(0)
        setLastEpoch('')
    }, [])

    const connect = useCallback((port: number = 9876) => {
        if (wsRef.current) {
            wsRef.current.close()
        }

        setError(null)
        const ws = new WebSocket(`ws://localhost:${port}`)

        ws.onopen = () => {
            console.log('[WS] Connected to sui-id-miner server')
            setIsConnected(true)
            setError(null)
        }

        ws.onclose = () => {
            console.log('[WS] Disconnected from server')
            setIsConnected(false)
            setIsRunning(false)
        }

        ws.onerror = () => {
            console.error('[WS] Connection error')
            setError('Please start sui-id-miner server first')
            setIsConnected(false)
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)

                switch (msg.type) {
                    case 'connected':
                        console.log('[WS] Server version:', msg.version)
                        break

                    case 'mining_started':
                        setIsRunning(true)
                        setPackageResult(null)
                        setAddressResult(null)
                        setProgress({ attempts: 0, hashrate: 0 })
                        console.log('[WS] Mining started:', msg.mode, msg)
                        break

                    case 'progress':
                        setProgress({
                            attempts: msg.attempts,
                            hashrate: msg.hashrate,
                        })
                        break

                    case 'package_found':
                        setPackageResult({
                            packageId: msg.package_id,
                            txDigest: msg.tx_digest,
                            txBytesBase64: msg.tx_bytes_base64,
                            attempts: msg.attempts,
                            gasBudgetUsed: msg.gas_budget_used,
                        })
                        setIsRunning(false)
                        break

                    case 'address_found':
                        setAddressResult({
                            address: msg.address,
                            privateKey: msg.private_key,
                            publicKey: msg.public_key,
                            attempts: msg.attempts,
                        })
                        setIsRunning(false)
                        break

                    case 'stopped':
                        // Save last_nonce for resume
                        if (msg.last_nonce !== undefined) {
                            setLastNonce(msg.last_nonce)
                        }
                        setIsRunning(false)
                        break

                    case 'error':
                        setError(msg.message)
                        setIsRunning(false)
                        break
                }
            } catch (e) {
                console.error('[WS] Failed to parse message:', e)
            }
        }

        wsRef.current = ws
    }, [])

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
    }, [])

    const startPackageMining = useCallback(
        (config: PackageMiningConfig) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                setError('Not connected to server')
                return
            }

            // Check if epoch (gas digest) changed - if so, reset nonce
            const currentEpoch = config.gasObjectDigest
            let nonceToUse = config.nonceOffset || 0

            if (currentEpoch !== lastEpoch) {
                // New epoch (gas object changed) - start from 0
                console.log(
                    `[Mining] New epoch detected: ${currentEpoch.slice(0, 8)}... (was: ${lastEpoch.slice(0, 8) || 'none'})`
                )
                nonceToUse = 0
                setLastNonce(0)
            } else if (lastNonce > 0) {
                // Same epoch - resume from last nonce
                console.log(`[Mining] Resuming from nonce: ${lastNonce}`)
                nonceToUse = lastNonce
            }

            // Update current epoch
            setLastEpoch(currentEpoch)

            const message = {
                type: 'start_package_mining',
                prefix: config.prefix,
                modules_base64: config.modulesBase64,
                sender: config.sender,
                gas_budget: config.gasBudget,
                gas_price: config.gasPrice,
                gas_object_id: config.gasObjectId,
                gas_object_version: parseInt(config.gasObjectVersion) || 0,
                gas_object_digest: config.gasObjectDigest,
                threads: config.threads,
                nonce_offset: nonceToUse,
            }

            setPackageResult(null)
            setAddressResult(null)
            setError(null)
            wsRef.current.send(JSON.stringify(message))
        },
        [lastEpoch, lastNonce]
    )

    const startAddressMining = useCallback((config: AddressMiningConfig) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError('Not connected to server')
            return
        }

        const message = {
            type: 'start_address_mining',
            prefix: config.prefix,
            threads: config.threads,
        }

        setPackageResult(null)
        setAddressResult(null)
        setError(null)
        wsRef.current.send(JSON.stringify(message))
    }, [])

    const stopMining = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop_mining' }))
        }
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    return {
        isConnected,
        isRunning,
        progress,
        packageResult,
        addressResult,
        error,
        lastNonce,
        lastEpoch,
        resetNonce,
        connect,
        disconnect,
        startPackageMining,
        startAddressMining,
        stopMining,
    }
}
