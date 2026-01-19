import type { MiningMode } from '../types'

interface ModeSwitcherProps {
    mode: MiningMode
    isRunning: boolean
    setMode: (mode: MiningMode) => void
}

export default function ModeSwitcher({ mode, isRunning, setMode }: ModeSwitcherProps) {
    return (
        <div className="flex border-b-4 border-black bg-white">
            <button
                onClick={() => !isRunning && setMode('ADDRESS')}
                className={`flex-1 py-4 font-bold text-lg uppercase tracking-wide transition-colors
                    ${mode === 'ADDRESS' ? 'bg-[var(--primary)] text-white' : 'hover:bg-gray-100'}
                    ${isRunning ? 'cursor-not-allowed opacity-50' : ''}
                `}
                disabled={isRunning}
            >
                💳 Wallet Address
            </button>
            <button
                onClick={() => !isRunning && setMode('PACKAGE')}
                className={`flex-1 py-4 font-bold text-lg uppercase tracking-wide transition-colors
                    ${mode === 'PACKAGE' ? 'bg-[var(--accent)] text-white' : 'hover:bg-gray-100'}
                    ${isRunning ? 'cursor-not-allowed opacity-50' : ''}
                `}
                disabled={isRunning}
            >
                📦 Package ID (Experimental)
            </button>
        </div>
    )
}
