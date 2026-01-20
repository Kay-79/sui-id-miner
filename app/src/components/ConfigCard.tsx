import { useRef, useState, useEffect } from 'react'
import type { MiningMode } from '../types'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

interface ConfigCardProps {
    mode: MiningMode
    setMode: (mode: MiningMode) => void
    prefix: string
    setPrefix: (prefix: string) => void
    baseGasBudget: number
    setBaseGasBudget: (val: number) => void
    isRunning: boolean
    difficulty: number
    estimatedAttempts: number
    isValidPrefix: boolean
    // WebSocket mode props
    modulesBase64: string[]
    setModulesBase64: (modules: string[]) => void
    sender: string
    setSender: (s: string) => void
    gasObjectId: string
    setGasObjectId: (id: string) => void
    // Network selection from parent (shared state)
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    // Thread count
    threadCount: number
    setThreadCount: (n: number) => void
    // Gas Coin mode
    splitAmounts: number[]
    setSplitAmounts: (amounts: number[]) => void
    // Move Call mode
    txBytesBase64: string
    setTxBytesBase64: (s: string) => void
    targetIndex: number
    setTargetIndex: (n: number) => void
    // Move Call Form
    mcTarget: string
    setMcTarget: (s: string) => void
    mcTypeArgs: string[]
    setMcTypeArgs: (args: string[]) => void
    mcArgs: { type: string; value: string }[]
    setMcArgs: (args: { type: string; value: string }[]) => void
}

function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(0)
}

export default function ConfigCard({
    mode,
    setMode,
    prefix,
    setPrefix,
    baseGasBudget,
    setBaseGasBudget,
    isRunning,
    difficulty,
    estimatedAttempts,
    isValidPrefix,
    modulesBase64,
    setModulesBase64,
    sender,
    setSender,
    gasObjectId,
    setGasObjectId,
    network,
    setNetwork,
    threadCount,
    setThreadCount,
    splitAmounts,
    setSplitAmounts,
    txBytesBase64,
    setTxBytesBase64,
    targetIndex,
    setTargetIndex,
    mcTarget,
    setMcTarget,
    mcTypeArgs,
    setMcTypeArgs,
    mcArgs,
    setMcArgs,
}: ConfigCardProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [statusMsg, setStatusMsg] = useState('')
    const [isFetching, setIsFetching] = useState(false)
    const [useBuilder, setUseBuilder] = useState(true) // Default to builder

    // Read .mv files and convert to Base64
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        setStatusMsg('Reading modules...')

        try {
            // Collect .mv files with their names for sorting
            // Exclude test modules and dependency modules
            const fileList: { name: string; file: File }[] = []

            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i]
                const fileName = file.name

                // Only include .mv files
                if (!fileName.endsWith('.mv')) continue

                // Check relative path to filter out dependency modules
                // webkitRelativePath is like: "bytecode_modules/avatar.mv" or "bytecode_modules/dependencies/Sui/balance.mv"
                const relativePath = (file as any).webkitRelativePath || ''
                if (
                    relativePath.includes('/dependencies/') ||
                    relativePath.includes('\\dependencies\\')
                ) {
                    console.log(`Skipping dependency: ${relativePath}`)
                    continue
                }

                // Exclude test modules (files ending with _tests.mv or _test.mv)
                const baseName = fileName.replace('.mv', '')
                if (baseName.endsWith('_tests') || baseName.endsWith('_test')) {
                    console.log(`Skipping test module: ${fileName}`)
                    continue
                }

                fileList.push({ name: fileName, file })
            }

            if (fileList.length === 0) {
                setStatusMsg('❌ No .mv files found (excluding tests)!')
                return
            }

            // Sort by filename for consistent ordering (critical for deployment!)
            // This matches the order used by `sui client publish`
            fileList.sort((a, b) => a.name.localeCompare(b.name))

            console.log(
                'Module order:',
                fileList.map((f) => f.name)
            )

            // Process files in sorted order
            const modules: string[] = []
            for (const { file } of fileList) {
                const buffer = await file.arrayBuffer()
                const bytes = new Uint8Array(buffer)
                let binary = ''
                for (let j = 0; j < bytes.byteLength; j++) {
                    binary += String.fromCharCode(bytes[j])
                }
                modules.push(btoa(binary))
            }

            const moduleNames = fileList.map((f) => f.name.replace('.mv', '')).join(', ')
            setModulesBase64(modules)
            setStatusMsg(`✅ Loaded ${modules.length} module(s): ${moduleNames}`)
        } catch (err: any) {
            console.error(err)
            setStatusMsg('❌ Error reading files: ' + err.message)
        }
    }

    // Fetch the coin with highest balance for sender
    const fetchBestGasCoin = async () => {
        if (!sender || isFetching) return
        // Validate sender format (0x + 64 hex chars)
        if (!/^0x[a-fA-F0-9]{64}$/.test(sender)) return

        setIsFetching(true)
        setStatusMsg(`⏳ Finding best gas coin on ${network.toUpperCase()}...`)
        try {
            const client = new SuiClient({ url: getFullnodeUrl(network) })
            const coins = await client.getAllCoins({ owner: sender })

            if (coins.data.length === 0) {
                setStatusMsg('❌ No coins found for this address on ' + network.toUpperCase())
                return
            }

            // Find SUI coins and get the one with highest balance
            const suiCoins = coins.data.filter((c) => c.coinType === '0x2::sui::SUI')
            if (suiCoins.length === 0) {
                setStatusMsg('❌ No SUI coins found on ' + network.toUpperCase())
                return
            }

            // Sort by balance descending and pick the highest
            const bestCoin = suiCoins.reduce((max, coin) =>
                BigInt(coin.balance) > BigInt(max.balance) ? coin : max
            )

            setGasObjectId(bestCoin.coinObjectId)
            // Version and digest will be auto-fetched by the gasObjectId useEffect
            setStatusMsg(`✅ Found coin with ${(Number(bestCoin.balance) / 1e9).toFixed(4)} SUI`)
        } catch (e: any) {
            console.error(e)
            setStatusMsg('❌ ' + e.message)
        } finally {
            setIsFetching(false)
        }
    }

    // Auto-fetch best gas coin when sender changes (debounced)
    useEffect(() => {
        if (!sender || !/^0x[a-fA-F0-9]{64}$/.test(sender)) return
        // Skip if sender is all zeros (default)
        if (/^0x0+$/.test(sender)) return

        const timer = setTimeout(() => {
            fetchBestGasCoin()
        }, 500)

        return () => clearTimeout(timer)
    }, [sender, network])

    // Helper to get config label
    const getConfigLabel = (m: MiningMode) => {
        switch (m) {
            case 'PACKAGE': return '📦 Package Config'
            case 'GAS_COIN': return '🪙 Gas Coin Config'
            case 'MOVE_CALL': return '⚡ Move Call Config'
            default: return '⚙️ Config'
        }
    }

    const getModeDescription = (m: MiningMode) => {
        switch (m) {
            case 'PACKAGE': return 'Vanity Package ID for your Move smart contract. (Result: 0x...::module)'
            case 'GAS_COIN': return 'Vanity ID for a split Coin<SUI> object. You can use it as Gas or just keep it.'
            case 'MOVE_CALL': return 'Vanity ID for an object created / transferred by a Move transaction (e.g. Minting an NFT).'
            default: return ''
        }
    }

    return (
        <div className="brutal-card p-6 mb-8 relative">
            <div className="flex justify-between items-center mb-2">
                <h2 className="heading-lg flex items-center gap-3">
                    {getConfigLabel(mode)}
                    {/* Status Dot */}
                </h2>
                {/* Mode Switcher */}
                <div className="flex gap-1">
                    {(['PACKAGE', 'GAS_COIN', 'MOVE_CALL'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            disabled={isRunning}
                            className={`px-3 py-1 text-xs font-bold uppercase border-2 border-black transition-all
                                ${mode === m
                                    ? 'bg-black text-white'
                                    : 'bg-white text-black hover:bg-gray-100'}
                                ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {m === 'PACKAGE' ? '📦 Package' : m === 'GAS_COIN' ? '🪙 Gas Coin' : '⚡ Move Call'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6 p-2 bg-gray-100 border border-gray-300 text-sm text-gray-700 rounded-sm">
                💡 <strong>Info:</strong> {getModeDescription(mode)}
            </div>

            <div className="grid gap-6">
                {/* Common: Prefix */}
                <div>
                    <label className="block mb-2 font-bold uppercase text-sm tracking-wide">
                        Target Hex Prefix <span className="text-[var(--primary)]">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-400">0x</span>
                        <input
                            type="text"
                            value={prefix}
                            onChange={(e) =>
                                setPrefix(e.target.value.replace(/[^0-9a-fA-F]/g, '').toLowerCase())
                            }
                            placeholder="e.g. face, 7979, 12345"
                            className={`brutal-input flex-1 font-mono text-lg ${!isValidPrefix && prefix ? 'border-[var(--error)]' : ''}`}
                            disabled={isRunning}
                            maxLength={64}
                        />
                    </div>
                    <div className="mt-2 flex items-center gap-4">
                        <span
                            className={`brutal-tag ${difficulty <= 3 ? 'bg-[var(--success)]' : difficulty <= 5 ? 'bg-[var(--warning)]' : 'bg-[var(--error)]'}`}
                        >
                            {difficulty} chars
                        </span>
                        <span className="text-sm text-gray-600 font-medium">
                            ~{formatNumber(estimatedAttempts)} attempts
                        </span>
                    </div>
                </div>

                {/* Package Mode Config */}
                {mode === 'PACKAGE' && (
                    <div className="space-y-4 p-4 bg-gray-50 border-2 border-dashed border-gray-300">
                        {/* Sender */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1">
                                Sender Address
                            </label>
                            <input
                                type="text"
                                value={sender}
                                onChange={(e) => setSender(e.target.value)}
                                className="brutal-input text-xs font-mono py-1"
                                placeholder="0x..."
                                maxLength={66}
                            />
                        </div>

                        {/* Gas Budget & Thread Count - same row */}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    Gas Budget
                                </label>
                                <input
                                    type="number"
                                    value={baseGasBudget}
                                    onChange={(e) =>
                                        setBaseGasBudget(parseInt(e.target.value) || 0)
                                    }
                                    className="brutal-input font-mono text-sm"
                                />
                            </div>
                            <div className="w-40">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    CPU Threads
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={64}
                                        value={threadCount || ''}
                                        onChange={(e) =>
                                            setThreadCount(
                                                Math.max(0, parseInt(e.target.value) || 0)
                                            )
                                        }
                                        className="brutal-input font-mono text-sm py-1 w-20"
                                        disabled={isRunning}
                                        placeholder="Auto"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Gas Object */}
                        <div className="p-3 bg-white border border-blue-200 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold uppercase">Gas Object</h4>
                                <div className="flex gap-1">
                                    {(['mainnet', 'testnet', 'devnet'] as const).map((net) => (
                                        <button
                                            key={net}
                                            onClick={() => setNetwork(net)}
                                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border border-black ${network === net ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                                        >
                                            {net}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <input
                                    type="text"
                                    value={gasObjectId}
                                    onChange={(e) => setGasObjectId(e.target.value)}
                                    className="brutal-input text-xs font-mono py-1"
                                    placeholder="Object ID (0x...) - fetched automatically"
                                    maxLength={66}
                                />
                            </div>
                        </div>

                        {/* Modules */}
                        <div className="p-3 bg-white border border-green-200 rounded">
                            <h4 className="text-xs font-bold uppercase mb-2">Move Modules</h4>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <label className="brutal-btn cursor-pointer bg-green-600 text-white text-sm py-1 px-3">
                                        🗃️ Upload Modules
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            className="hidden"
                                            accept=".mv"
                                            multiple
                                        />
                                    </label>
                                    <span className="text-xs text-gray-500">(.mv files)</span>
                                </div>
                                <span className="text-xs font-bold text-[var(--primary)]">
                                    {modulesBase64.length > 0
                                        ? `${modulesBase64.length} module(s)`
                                        : ''}
                                </span>
                            </div>
                            {statusMsg && <p className="text-xs mt-2 font-medium">{statusMsg}</p>}
                        </div>
                    </div>
                )}

                {/* Gas Coin Mode Config */}
                {mode === 'GAS_COIN' && (
                    <div className="space-y-4 p-4 bg-amber-50 border-2 border-dashed border-amber-300">
                        {/* Sender */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1">
                                Sender Address
                            </label>
                            <input
                                type="text"
                                value={sender}
                                onChange={(e) => setSender(e.target.value)}
                                className="brutal-input text-xs font-mono py-1"
                                placeholder="0x..."
                                maxLength={66}
                            />
                        </div>

                        {/* Split Amount */}
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1">
                                Split Amount (SUI)
                            </label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={splitAmounts[0] / 1_000_000_000}
                                    onChange={(e) => {
                                        const sui = parseFloat(e.target.value) || 0
                                        const mist = Math.floor(sui * 1_000_000_000)
                                        setSplitAmounts([mist])
                                    }}
                                    className="brutal-input font-mono text-sm w-32"
                                    disabled={isRunning}
                                />
                                <span className="text-xs text-gray-500">
                                    = {splitAmounts[0].toLocaleString()} MIST
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Amount of SUI to split into a new coin with vanity ID
                            </p>
                        </div>

                        {/* Gas Budget & Thread Count */}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    Gas Budget
                                </label>
                                <input
                                    type="number"
                                    value={baseGasBudget}
                                    onChange={(e) =>
                                        setBaseGasBudget(parseInt(e.target.value) || 0)
                                    }
                                    className="brutal-input font-mono text-sm"
                                />
                            </div>
                            <div className="w-40">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    CPU Threads
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={64}
                                        value={threadCount || ''}
                                        onChange={(e) =>
                                            setThreadCount(
                                                Math.max(0, parseInt(e.target.value) || 0)
                                            )
                                        }
                                        className="brutal-input font-mono text-sm py-1 w-20"
                                        disabled={isRunning}
                                        placeholder="Auto"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Gas Object */}
                        <div className="p-3 bg-white border border-amber-200 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold uppercase">Gas Object (Source Coin)</h4>
                                <div className="flex gap-1">
                                    {(['mainnet', 'testnet', 'devnet'] as const).map((net) => (
                                        <button
                                            key={net}
                                            onClick={() => setNetwork(net)}
                                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border border-black ${network === net ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                                        >
                                            {net}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <input
                                    type="text"
                                    value={gasObjectId}
                                    onChange={(e) => setGasObjectId(e.target.value)}
                                    className="brutal-input text-xs font-mono py-1"
                                    placeholder="Object ID (0x...) - fetched automatically"
                                    maxLength={66}
                                />
                            </div>
                        </div>

                        {statusMsg && <p className="text-xs mt-2 font-medium">{statusMsg}</p>}
                    </div>
                )}

                {/* Move Call Mode Config */}
                {mode === 'MOVE_CALL' && (
                    <div className="space-y-4 p-4 bg-purple-50 border-2 border-dashed border-purple-300">
                        {/* Builder Toggle */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setUseBuilder(true)}
                                className={`px-3 py-1 text-xs font-bold uppercase border border-purple-600 ${useBuilder ? 'bg-purple-600 text-white' : 'bg-white text-purple-600'}`}
                            >
                                🛠️ Form Builder
                            </button>
                            <button
                                onClick={() => setUseBuilder(false)}
                                className={`px-3 py-1 text-xs font-bold uppercase border border-purple-600 ${!useBuilder ? 'bg-purple-600 text-white' : 'bg-white text-purple-600'}`}
                            >
                                📝 Raw Bytes
                            </button>
                        </div>

                        {useBuilder ? (
                            <div className="space-y-4">
                                {/* Target */}
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">
                                        Target Function
                                    </label>
                                    <input
                                        type="text"
                                        value={mcTarget}
                                        onChange={(e) => setMcTarget(e.target.value)}
                                        className="brutal-input font-mono text-sm w-full"
                                        placeholder="package::module::function"
                                        disabled={isRunning}
                                    />
                                </div>

                                {/* Type Args */}
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">
                                        Type Arguments (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={mcTypeArgs.join(', ')}
                                        onChange={(e) => setMcTypeArgs(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                        className="brutal-input font-mono text-sm w-full"
                                        placeholder="0x2::sui::SUI, 0x..."
                                        disabled={isRunning}
                                    />
                                </div>

                                {/* Arguments */}
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-2">
                                        Function Input Arguments
                                    </label>
                                    <div className="space-y-3">
                                        {mcArgs.map((arg, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-white p-2 border border-purple-200 shadow-sm">
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <span className="text-[10px] text-gray-400 font-mono w-4">#{idx}</span>
                                                    <select
                                                        value={arg.type}
                                                        onChange={(e) => {
                                                            const newArgs = [...mcArgs]
                                                            newArgs[idx].type = e.target.value
                                                            setMcArgs(newArgs)
                                                        }}
                                                        className="brutal-input text-xs h-8 py-0 min-w-[100px]"
                                                        disabled={isRunning}
                                                    >
                                                        <option value="string">String</option>
                                                        <option value="number">Number</option>
                                                        <option value="address">Address</option>
                                                        <option value="bool">Bool</option>
                                                        <option value="object">Object ID</option>
                                                    </select>
                                                </div>

                                                <input
                                                    type="text"
                                                    value={arg.value}
                                                    onChange={(e) => {
                                                        const newArgs = [...mcArgs]
                                                        newArgs[idx].value = e.target.value
                                                        setMcArgs(newArgs)
                                                    }}
                                                    className="brutal-input font-mono text-sm flex-1 w-full min-w-[120px]"
                                                    placeholder={arg.type === 'bool' ? 'true/false' : `Value for ${arg.type}`}
                                                    disabled={isRunning}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newArgs = mcArgs.filter((_, i) => i !== idx)
                                                        setMcArgs(newArgs)
                                                    }}
                                                    className="px-2 py-1 border border-red-500 text-red-500 font-bold hover:bg-red-50 text-xs self-end sm:self-center"
                                                    disabled={isRunning}
                                                    title="Remove Argument"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setMcArgs([...mcArgs, { type: 'string', value: '' }])}
                                            className="w-full py-2 border-2 border-dashed border-purple-400 text-purple-600 font-bold text-xs uppercase hover:bg-purple-100 transition-colors"
                                            disabled={isRunning}
                                        >
                                            + Add Argument Input
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Transaction Bytes */
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1">
                                    Transaction Bytes (Base64)
                                </label>
                                <textarea
                                    value={txBytesBase64}
                                    onChange={(e) => setTxBytesBase64(e.target.value)}
                                    className="brutal-input text-xs font-mono py-2 h-24 w-full"
                                    placeholder="Paste Base64 encoded transaction bytes here..."
                                    disabled={isRunning}
                                />
                                <p className="text-[10px] text-gray-500 mt-1">
                                    Build a transaction and export as BCS bytes.
                                </p>
                            </div>
                        )}

                        {/* Target Index & Threads */}
                        <div className="flex gap-4 border-t border-purple-200 pt-4 mt-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    Target Object Index
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    value={targetIndex}
                                    onChange={(e) =>
                                        setTargetIndex(Math.max(0, parseInt(e.target.value) || 0))
                                    }
                                    className="brutal-input font-mono text-sm"
                                    placeholder="0"
                                    disabled={isRunning}
                                />
                            </div>
                            <div className="w-40">
                                <label className="block text-xs font-bold uppercase mb-1">
                                    CPU Threads
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        max={64}
                                        value={threadCount || ''}
                                        onChange={(e) =>
                                            setThreadCount(
                                                Math.max(0, parseInt(e.target.value) || 0)
                                            )
                                        }
                                        className="brutal-input font-mono text-sm py-1 w-20"
                                        disabled={isRunning}
                                        placeholder="Auto"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
