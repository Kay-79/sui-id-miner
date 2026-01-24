import type { ChangeEvent } from 'react'
import NeoSelect from '../NeoSelect'
import { useBestGasCoin } from '../../hooks/useBestGasCoin'

interface MoveCallConfigProps {
    mcTarget: string
    setMcTarget: (s: string) => void
    mcTypeArgs: string[]
    setMcTypeArgs: (args: string[]) => void
    mcArgs: { type: string; value: string }[]
    setMcArgs: (args: { type: string; value: string }[]) => void
    targetIndex: number
    setTargetIndex: (n: number) => void
    threadCount: number
    setThreadCount: (n: number) => void
    baseGasBudget: number
    setBaseGasBudget: (val: number) => void

    sender: string
    setSender: (s: string) => void
    gasObjectId: string
    setGasObjectId: (id: string) => void
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    isRunning: boolean
    useGpu: boolean
}

export default function MoveCallConfig({
    mcTarget,
    setMcTarget,
    mcTypeArgs,
    setMcTypeArgs,
    mcArgs,
    setMcArgs,
    targetIndex,
    setTargetIndex,
    threadCount,
    setThreadCount,
    baseGasBudget,
    setBaseGasBudget,

    sender,
    setSender,
    gasObjectId,
    setGasObjectId,
    network,
    setNetwork,
    isRunning,
    useGpu
}: MoveCallConfigProps) {
    // Use the hook for gas coin logic
    const { statusMsg: gasStatusMsg } = useBestGasCoin({
        sender,
        network,
        setGasObjectId
    })

    const handleSenderChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Allow empty
        if (val === '') {
            setSender(val)
            return
        }
        // Strict hex validation: 0, 0x, or 0x[hex]
        if (/^(0|0x|0x[0-9a-fA-F]*)$/.test(val)) {
            setSender(val)
        }
    }

    return (
        <div className="space-y-4 p-4 bg-purple-50 border-2 border-dashed border-purple-300">
            {/* Builder Mode Only - Raw Bytes Hidden */}
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

                {/* Sender */}
                <div>
                     <label className="block text-xs font-bold uppercase mb-1">
                        Sender Address
                    </label>
                    <input
                        type="text"
                        value={sender}
                        onChange={handleSenderChange}
                        className="brutal-input font-mono text-sm w-full"
                        placeholder="0x..."
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
                                    <NeoSelect
                                        value={arg.type}
                                        onChange={(val) => {
                                            const newArgs = [...mcArgs]
                                            newArgs[idx].type = val as string
                                            setMcArgs(newArgs)
                                        }}
                                        options={[
                                            { value: 'string', label: 'String' },
                                            { value: 'number', label: 'Number' },
                                            { value: 'address', label: 'Address' },
                                            { value: 'bool', label: 'Bool' },
                                            { value: 'object', label: 'Object ID' },
                                        ]}
                                        className="min-w-[140px]"
                                        disabled={isRunning}
                                    />
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
                            disabled={isRunning || useGpu}
                            placeholder={useGpu ? 'GPU' : 'Auto'}
                        />
                    </div>
                </div>
                <div className="w-40">
                    <label className="block text-xs font-bold uppercase mb-1">
                        Base Gas Budget
                    </label>
                     <input
                        type="number"
                        min={1000}
                        step={100}
                        value={baseGasBudget || ''}
                        onChange={(e) =>
                            setBaseGasBudget(
                                Math.max(0, parseInt(e.target.value) || 0)
                            )
                        }
                        className="brutal-input font-mono text-sm py-1 w-full"
                        disabled={isRunning}
                        placeholder="100000000"
                    />
                </div>
            </div>

             {/* Gas Object */}
            <div className="p-3 bg-white border border-blue-200 rounded mt-4">
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
                        disabled={isRunning}
                    />
                </div>
                 {gasStatusMsg && <p className="text-xs mt-2 font-medium">{gasStatusMsg}</p>}
            </div>
        </div>
    )
}
