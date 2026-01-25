interface CommonConfigProps {
    prefix: string
    setPrefix: (prefix: string) => void
    difficulty: number
    estimatedAttempts: number
    isValidPrefix: boolean
    isRunning: boolean
}

// Format number utility
function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(0)
}

export default function CommonConfig({
    prefix,
    setPrefix,
    difficulty,
    estimatedAttempts,
    isValidPrefix,
    isRunning,
}: CommonConfigProps) {
    return (
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
    )
}
