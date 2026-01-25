import type { ChangeEvent } from 'react'

interface SenderInputProps {
    value: string
    onChange: (val: string) => void
    disabled?: boolean
}

export default function SenderInput({ value, onChange, disabled }: SenderInputProps) {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Allow empty
        if (val === '') {
            onChange(val)
            return
        }
        // Strict hex validation: 0, 0x, or 0x[hex]
        if (/^(0|0x|0x[0-9a-fA-F]*)$/.test(val)) {
            onChange(val)
        }
    }

    return (
        <div>
            <label className="block text-xs font-bold uppercase mb-1">
                Sender Address
            </label>
            <input
                type="text"
                value={value}
                onChange={handleChange}
                className="brutal-input font-mono text-sm w-full py-1"
                placeholder="0x..."
                maxLength={66}
                disabled={disabled}
            />
        </div>
    )
}
