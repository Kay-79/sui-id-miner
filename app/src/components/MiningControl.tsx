interface MiningControlProps {
    isRunning: boolean
    isConfigValid: boolean
    isConnected: boolean
    onConnect: () => void
    startMining: () => void
    stopMining: () => void
    hashrate: number
    attempts: number
    progress: number
    useGpu: boolean
    setUseGpu: (val: boolean) => void
    threadCount: number
    setThreadCount: (val: number) => void
}

function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(0)
}

export default function MiningControl({
    isRunning,
    isConfigValid: _isConfigValid,
    isConnected,
    onConnect,
    startMining,
    stopMining,
    hashrate,
    attempts,
    progress,
    useGpu,
    setUseGpu,
    threadCount,
    setThreadCount,
}: MiningControlProps) {
    return (
        <div className={`brutal-card p-6 ${isRunning ? 'mining-active' : ''}`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isRunning ? (
                        <>
                            <div className="w-8 h-8 border-4 border-t-transparent rounded-full spin border-[var(--accent)]"></div>
                            <span className="text-xl font-bold">Generating...</span>
                        </>
                    ) : (
                        <div className="flex flex-col gap-2">
                             <span className="text-xl font-bold">
                                {isConnected ? 'Ready to generate' : '⚠️ Not Connected'}
                            </span>
                            {isConnected && (
                                <div className="flex items-center gap-4 text-sm">
                                    {/* GPU Toggle */}
                                    <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-2 py-1 rounded border border-gray-300 hover:bg-gray-200">
                                        <input
                                            type="checkbox"
                                            checked={useGpu}
                                            onChange={(e) => setUseGpu(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--accent)]"
                                        />
                                        <span className="font-bold uppercase tracking-wide">
                                            ⚡ Use GPU
                                        </span>
                                    </label>

                                    {/* Thread Count */}
                                    {!useGpu && (
                                        <div className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded border border-gray-300">
                                            <span className="font-bold uppercase tracking-wide">
                                                Threads:
                                            </span>
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
                                                className="w-12 bg-transparent text-center font-mono focus:outline-none border-b border-gray-400 focus:border-black"
                                                placeholder="Auto"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isRunning ? (
                    <button onClick={stopMining} className="brutal-btn brutal-btn-stop">
                        ⏹️ Stop
                    </button>
                ) : !isConnected ? (
                    <button
                        onClick={onConnect}
                        className="brutal-btn bg-[var(--primary)] text-white"
                    >
                        🔗 Connect local server
                    </button>
                ) : (
                    <button
                        onClick={startMining}
                        className="brutal-btn"
                        style={{ backgroundColor: 'var(--accent)' }}
                    >
                        ⚡ Start Generation
                    </button>
                )}
            </div>

            {/* Stats Bar */}
            {isRunning && (
                <div className="mt-6 p-4 bg-white border-2 border-black flex flex-wrap gap-6 justify-center md:justify-between text-center">
                    <div>
                        <div className="text-xs font-bold uppercase text-gray-500">Hashrate</div>
                        <div className="text-xl font-black">
                            {hashrate > 0 ? `${formatNumber(hashrate)} H/s` : '⏳ Calculating...'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold uppercase text-gray-500">Attempts</div>
                        <div className="text-xl font-black">{formatNumber(attempts)}</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold uppercase text-gray-500">
                            Probable Progress
                        </div>
                        <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>
                            {progress.toFixed(2)}%
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
