import { useState, useCallback, useEffect } from 'react'
import './App.css'
import './index.css'

import type { MiningMode, MiningState, FoundResult } from './types'
import Header from './components/Header'
import Footer from './components/Footer'
// import ModeSwitcher from "./components/ModeSwitcher";
import ConfigCard from './components/ConfigCard'
import MiningControl from './components/MiningControl'
import ResultsList from './components/ResultsList'
import { useWebSocketMiner } from './hooks/useWebSocketMiner'
import { useToast } from './hooks/useToast'
import { ToastContainer } from './components/Toast'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

function App() {
    // Config State
    const [mode, _setMode] = useState<MiningMode>('PACKAGE')
    const [prefix, setPrefix] = useState('')

    // Package Mode Specific Config
    const [baseGasBudget, setBaseGasBudget] = useState(100000000)

    // Package Mode: Module storage + Gas Object
    const [modulesBase64, setModulesBase64] = useState<string[]>([])
    const [sender, setSender] = useState(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
    )
    const [gasObjectId, setGasObjectId] = useState('')
    const [network, setNetwork] = useState<'mainnet' | 'testnet' | 'devnet'>('testnet')
    const [threadCount, setThreadCount] = useState(0) // 0 = auto (use all cores)

    // WebSocket Miner
    const wsMiner = useWebSocketMiner()

    // Toast
    const { toasts, showToast, removeToast } = useToast()

    // Results State
    const [state, setState] = useState<MiningState>({
        isRunning: false,
        attempts: 0,
        hashrate: 0,
        startTime: null,
        foundResults: [],
    })

    // Computed
    const difficulty = prefix.length
    const estimatedAttempts = Math.pow(16, difficulty)
    const isValidPrefix = prefix.length > 0 && /^[0-9a-fA-F]+$/.test(prefix)

    const isConfigValid =
        mode === 'ADDRESS'
            ? isValidPrefix
            : isValidPrefix && modulesBase64.length > 0 && gasObjectId

    // Track WebSocket results -> add to foundResults
    // This is a valid pattern: syncing external WebSocket state with React state
    useEffect(() => {
        if (wsMiner.packageResult) {
            const result: FoundResult = {
                type: 'PACKAGE',
                packageId: wsMiner.packageResult.packageId,
                txDigest: wsMiner.packageResult.txDigest,
                txBytesBase64: wsMiner.packageResult.txBytesBase64,
                attempts: wsMiner.packageResult.attempts,
                timestamp: Date.now(),
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
            setState((prev) => ({
                ...prev,
                foundResults: [...prev.foundResults, result],
            }))
        }
    }, [wsMiner.packageResult])

    useEffect(() => {
        if (wsMiner.addressResult) {
            const result: FoundResult = {
                type: 'ADDRESS',
                address: wsMiner.addressResult.address,
                private_key: wsMiner.addressResult.privateKey,
                public_key: wsMiner.addressResult.publicKey,
                attempts: wsMiner.addressResult.attempts,
                timestamp: Date.now(),
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
            setState((prev) => ({
                ...prev,
                foundResults: [...prev.foundResults, result],
            }))
        }
    }, [wsMiner.addressResult])

    // Actions
    const startMining = useCallback(async () => {
        // Validate and show toast for missing fields
        if (!wsMiner.isConnected) {
            showToast('Please connect to the server first!', 'error')
            return
        }

        if (!isValidPrefix) {
            showToast('Please enter a valid hex prefix!', 'error')
            return
        }

        if (mode === 'PACKAGE') {
            // Check if sender is zero address
            if (/^0x0+$/.test(sender)) {
                showToast('Please set Sender Address!', 'error')
                return
            }
            if (modulesBase64.length === 0) {
                showToast('Please upload .mv module files!', 'error')
                return
            }
            if (!gasObjectId) {
                showToast('Please enter Gas Object ID!', 'error')
                return
            }

            // Auto-fetch gas object version/digest right before mining
            showToast('Fetching gas object details...', 'info')

            try {
                const client = new SuiClient({ url: getFullnodeUrl(network) })
                const data = await client.getObject({ id: gasObjectId })

                if (!data.data) {
                    showToast('Gas object not found!', 'error')
                    return
                }

                const gasVersion = data.data.version
                const gasDigest = data.data.digest

                showToast(`Gas object verified: v${gasVersion}`, 'success')

                // Start mining - hook auto-tracks epoch (gas digest) and resumes nonce
                wsMiner.startPackageMining({
                    prefix,
                    modulesBase64,
                    sender,
                    gasBudget: baseGasBudget,
                    gasPrice: 1000,
                    gasObjectId,
                    gasObjectVersion: gasVersion,
                    gasObjectDigest: gasDigest,
                    threads: threadCount > 0 ? threadCount : undefined,
                })
            } catch (e: any) {
                showToast('Failed to fetch gas object: ' + e.message, 'error')
            }
            return
        }

        if (mode === 'ADDRESS') {
            wsMiner.startAddressMining({
                prefix,
                threads: threadCount > 0 ? threadCount : undefined,
            })
        }
    }, [
        isValidPrefix,
        mode,
        prefix,
        modulesBase64,
        sender,
        baseGasBudget,
        gasObjectId,
        network,
        wsMiner,
        showToast,
    ])

    const stopMining = useCallback(() => {
        wsMiner.stopMining()
    }, [wsMiner])

    const clearResults = useCallback(() => {
        setState((prev) => ({ ...prev, foundResults: [] }))
    }, [])

    // Compute progress
    const attempts = wsMiner.progress?.attempts || 0
    const hashrate = wsMiner.progress?.hashrate || 0
    const progress = Math.min((attempts / estimatedAttempts) * 100, 100)

    return (
        <div className="min-h-screen p-4 md:p-8 bg-[var(--light)]">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <Header />

            <div className="max-w-4xl mx-auto grid gap-6">
                {wsMiner.error && (
                    <div className="brutal-card p-4 bg-red-50 border-red-500 text-red-700">
                        ❌ {wsMiner.error}
                    </div>
                )}

                {/* <ModeSwitcher mode={mode} isRunning={wsMiner.isRunning} setMode={setMode} /> */}

                <ConfigCard
                    mode={mode}
                    prefix={prefix}
                    setPrefix={setPrefix}
                    baseGasBudget={baseGasBudget}
                    setBaseGasBudget={setBaseGasBudget}
                    isRunning={wsMiner.isRunning}
                    difficulty={difficulty}
                    estimatedAttempts={estimatedAttempts}
                    isValidPrefix={isValidPrefix}
                    modulesBase64={modulesBase64}
                    setModulesBase64={setModulesBase64}
                    sender={sender}
                    setSender={setSender}
                    gasObjectId={gasObjectId}
                    setGasObjectId={setGasObjectId}
                    network={network}
                    setNetwork={setNetwork}
                    threadCount={threadCount}
                    setThreadCount={setThreadCount}
                />

                <MiningControl
                    mode={mode}
                    isRunning={wsMiner.isRunning}
                    isConfigValid={!!(isConfigValid && wsMiner.isConnected)}
                    isConnected={wsMiner.isConnected}
                    onConnect={() => wsMiner.connect()}
                    startMining={startMining}
                    stopMining={stopMining}
                    hashrate={hashrate}
                    attempts={attempts}
                    progress={progress}
                />

                <ResultsList
                    mode={mode}
                    results={state.foundResults}
                    clearResults={clearResults}
                    sender={sender}
                />

                <Footer mode={mode} />
            </div>
        </div>
    )
}

export default App
