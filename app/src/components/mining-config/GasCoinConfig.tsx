import SenderInput from './shared/SenderInput'
import GasSettings from './shared/GasSettings'
import GasObjectInput from './shared/GasObjectInput'

interface GasCoinConfigProps {
    sender: string
    setSender: (s: string) => void
    baseGasBudget: number
    setBaseGasBudget: (val: number) => void
    setSplitAmounts: (amounts: number[]) => void
    splitAmounts: number[]
    gasObjectId: string
    setGasObjectId: (id: string) => void
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    isRunning: boolean
}

export default function GasCoinConfig({
    sender,
    setSender,
    baseGasBudget,
    setBaseGasBudget,
    gasObjectId,
    setGasObjectId,
    network,
    setNetwork,
    splitAmounts,
    setSplitAmounts,
    isRunning,
}: GasCoinConfigProps) {
    return (
        <div className="space-y-4 p-4 bg-amber-50 border-2 border-dashed border-amber-300">
            <SenderInput
                value={sender}
                onChange={setSender}
            />

            <GasSettings
                gasBudget={baseGasBudget}
                setGasBudget={setBaseGasBudget}
                disabled={isRunning}
            >
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
                    </div>
                    {/* Compact Hint - removed extra padding to fit row */}
                </div>
            </GasSettings>

            <GasObjectInput
                objectId={gasObjectId}
                setObjectId={setGasObjectId}
                sender={sender}
                network={network}
                setNetwork={setNetwork}
                disabled={isRunning}
                borderColorClass="border-amber-200"
            />
        </div>
    )
}

