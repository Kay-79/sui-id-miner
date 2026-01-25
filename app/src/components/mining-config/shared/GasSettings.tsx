interface GasSettingsProps {
    gasBudget: number
    setGasBudget: (val: number) => void
    disabled?: boolean
    children?: React.ReactNode
}

export default function GasSettings({
    gasBudget,
    setGasBudget,
    disabled,
    children,
}: GasSettingsProps) {
    return (
        <div className="flex gap-4">
            {children}
            <div className="flex-1">
                <label className="block text-xs font-bold uppercase mb-1">
                    Gas Budget
                </label>
                <input
                    type="number"
                    value={gasBudget || ''}
                    onChange={(e) => setGasBudget(parseInt(e.target.value) || 0)}
                    className="brutal-input font-mono text-sm w-full"
                    placeholder="100000000"
                    disabled={disabled}
                />
            </div>
        </div>
    )
}
