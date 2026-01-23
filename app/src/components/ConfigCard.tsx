import type { MiningMode } from '../types'
import CommonConfig from './mining-config/CommonConfig'
import PackageConfig from './mining-config/PackageConfig'
import GasCoinConfig from './mining-config/GasCoinConfig'
import MoveCallConfig from './mining-config/MoveCallConfig'

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
    useGpu: boolean
    setUseGpu: (useGpu: boolean) => void
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
    useGpu,
    setUseGpu,
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
    targetIndex,
    setTargetIndex,
    mcTarget,
    setMcTarget,
    mcTypeArgs,
    setMcTypeArgs,
    mcArgs,
    setMcArgs,
}: ConfigCardProps) {
    // Helper to get config label
    const getConfigLabel = (m: MiningMode) => {
        switch (m) {
            case 'PACKAGE':
                return '📦 Package Config'
            case 'GAS_COIN':
                return '🪙 Gas Coin Config'
            case 'MOVE_CALL':
                return '⚡ Move Call Config'
            default:
                return '⚙️ Config'
        }
    }

    const getModeDescription = (m: MiningMode) => {
        switch (m) {
            case 'PACKAGE':
                return 'Vanity Package ID for your Move smart contract. (Result: 0x...::module)'
            case 'MOVE_CALL':
                return 'Vanity ID for an object created / transferred by a Move transaction (e.g. Minting an NFT).'
            case 'GAS_COIN':
                return 'Vanity ID for a split Coin<SUI> object. You can use it as Gas or just keep it.'
            default:
                return ''
        }
    }

    return (
        <div className="brutal-card p-6 mb-8 relative">
            <div className="flex justify-between items-center mb-2">
                <h2 className="heading-lg flex items-center gap-3">{getConfigLabel(mode)}</h2>
                {/* Mode Switcher */}
                <div className="flex gap-1">
                    {(['PACKAGE', 'MOVE_CALL', 'GAS_COIN'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            disabled={isRunning}
                            className={`px-3 py-1 text-xs font-bold uppercase border-2 border-black transition-all
                                ${
                                    mode === m
                                        ? 'bg-black text-white'
                                        : 'bg-white text-black hover:bg-gray-100'
                                }
                                ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {m === 'PACKAGE'
                                ? '📦 Package'
                                : m === 'GAS_COIN'
                                  ? '🪙 Gas Coin'
                                  : '⚡ Move Call'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6 p-2 bg-gray-100 border border-gray-300 text-sm text-gray-700 rounded-sm">
                💡 <strong>Info:</strong> {getModeDescription(mode)}
            </div>

            <div className="grid gap-6">
                {/* Common: Prefix */}
                <CommonConfig
                    prefix={prefix}
                    setPrefix={setPrefix}
                    difficulty={difficulty}
                    estimatedAttempts={estimatedAttempts}
                    isValidPrefix={isValidPrefix}
                    isRunning={isRunning}
                    useGpu={useGpu}
                    setUseGpu={setUseGpu}
                />

                {/* Package Mode Config */}
                {mode === 'PACKAGE' && (
                    <PackageConfig
                        sender={sender}
                        setSender={setSender}
                        baseGasBudget={baseGasBudget}
                        setBaseGasBudget={setBaseGasBudget}
                        threadCount={threadCount}
                        setThreadCount={setThreadCount}
                        gasObjectId={gasObjectId}
                        setGasObjectId={setGasObjectId}
                        network={network}
                        setNetwork={setNetwork}
                        modulesBase64={modulesBase64}
                        setModulesBase64={setModulesBase64}
                        isRunning={isRunning}
                    />
                )}

                {/* Gas Coin Mode Config */}
                {mode === 'GAS_COIN' && (
                    <GasCoinConfig
                        sender={sender}
                        setSender={setSender}
                        baseGasBudget={baseGasBudget}
                        setBaseGasBudget={setBaseGasBudget}
                        threadCount={threadCount}
                        setThreadCount={setThreadCount}
                        gasObjectId={gasObjectId}
                        setGasObjectId={setGasObjectId}
                        network={network}
                        setNetwork={setNetwork}
                        splitAmounts={splitAmounts}
                        setSplitAmounts={setSplitAmounts}
                        isRunning={isRunning}
                    />
                )}

                {/* Move Call Mode Config */}
                {mode === 'MOVE_CALL' && (
                    <MoveCallConfig
                        mcTarget={mcTarget}
                        setMcTarget={setMcTarget}
                        mcTypeArgs={mcTypeArgs}
                        setMcTypeArgs={setMcTypeArgs}
                        mcArgs={mcArgs}
                        setMcArgs={setMcArgs}
                        targetIndex={targetIndex}
                        setTargetIndex={setTargetIndex}
                        threadCount={threadCount}
                        setThreadCount={setThreadCount}
                        isRunning={isRunning}
                    />
                )}
            </div>
        </div>
    )
}
