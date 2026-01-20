import NeoSelect from '../NeoSelect'

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
    isRunning: boolean
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
    isRunning
}: MoveCallConfigProps) {
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
                            disabled={isRunning}
                            placeholder="Auto"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
