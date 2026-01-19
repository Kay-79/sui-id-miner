import type { MiningMode } from '../types'

interface MiningControlProps {
    mode: MiningMode
    isRunning: boolean
    isConfigValid: boolean
    isConnected: boolean
    onConnect: () => void
    startMining: () => void
    stopMining: () => void
    hashrate: number
    attempts: number
    progress: number
}

function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(0)
}

export default function MiningControl({
    mode,
    isRunning,
    isConfigValid: _isConfigValid,
    isConnected,
    onConnect,
    startMining,
    stopMining,
    hashrate,
    attempts,
    progress
}: MiningControlProps) {
    return (
        <div className={`brutal-card p-6 ${isRunning ? 'mining-active' : ''}`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isRunning ? (
                        <>
                            <div className={`w-8 h-8 border-4 border-t-transparent rounded-full spin ${mode === 'ADDRESS' ? 'border-[var(--primary)]' : 'border-[var(--accent)]'}`}></div>
                            <span className="text-xl font-bold">
                                Mining {mode === 'ADDRESS' ? 'Wallet' : 'Package'}...
                            </span>
                        </>
                    ) : (
                        <span className="text-xl font-bold">
                            {isConnected ? 'Ready to mine' : '⚠️ Not Connected'}
                        </span>
                    )}
                </div>
                
                {isRunning ? (
                    <button onClick={stopMining} className="brutal-btn brutal-btn-stop">
                        ⏹️ Stop Mining
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
                        style={{ backgroundColor: mode === 'ADDRESS' ? 'var(--primary)' : 'var(--accent)' }}
                    >
                        ⚡ Start Mining
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
                        <div className="text-xs font-bold uppercase text-gray-500">Probable Progress</div>
                        <div className="text-xl font-black" style={{ color: mode === 'ADDRESS' ? 'var(--primary)' : 'var(--accent)' }}>
                            {progress >= 100 ? '99.99% 😅' : `${progress.toFixed(1)}%`}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
