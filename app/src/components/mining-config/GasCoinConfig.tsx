import { useBestGasCoin } from '../../hooks/useBestGasCoin'

interface GasCoinConfigProps {
    sender: string
    setSender: (s: string) => void
    baseGasBudget: number
    setBaseGasBudget: (val: number) => void
    threadCount: number
    setThreadCount: (n: number) => void
    gasObjectId: string
    setGasObjectId: (id: string) => void
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    splitAmounts: number[]
    setSplitAmounts: (amounts: number[]) => void
    isRunning: boolean
    useGpu: boolean
}

export default function GasCoinConfig({
    sender,
    setSender,
    baseGasBudget,
    setBaseGasBudget,
    threadCount,
    setThreadCount,
    gasObjectId,
    setGasObjectId,
    network,
    setNetwork,
    splitAmounts,
    setSplitAmounts,
    isRunning,
    useGpu
}: GasCoinConfigProps) {
    const { statusMsg } = useBestGasCoin({
        sender,
        network,
        setGasObjectId
    })

    const handleSenderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val === '') {
            setSender(val)
            return
        }
        if (/^(0|0x|0x[0-9a-fA-F]*)$/.test(val)) {
            setSender(val)
        }
    }

    return (
        <div className="space-y-4 p-4 bg-amber-50 border-2 border-dashed border-amber-300">
            {/* Sender */}
            <div>
                <label className="block text-xs font-bold uppercase mb-1">
                    Sender Address
                </label>
                <input
                    type="text"
                    value={sender}
                    onChange={handleSenderChange}
                    className="brutal-input text-xs font-mono py-1"
                    placeholder="0x..."
                    maxLength={66}
                />
            </div>

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
                    <span className="text-xs text-gray-500">
                        = {splitAmounts[0].toLocaleString()} MIST
                    </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                    Amount of SUI to split into a new coin with vanity ID
                </p>
            </div>

            {/* Gas Budget & Thread Count */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold uppercase mb-1">
                        Gas Budget
                    </label>
                    <input
                        type="number"
                        value={baseGasBudget}
                        onChange={(e) =>
                            setBaseGasBudget(parseInt(e.target.value) || 0)
                        }
                        className="brutal-input font-mono text-sm"
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
            </div>

            {/* Gas Object */}
            <div className="p-3 bg-white border border-amber-200 rounded">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold uppercase">Gas Object (Source Coin)</h4>
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
                    />
                </div>
            </div>

            {statusMsg && <p className="text-xs mt-2 font-medium">{statusMsg}</p>}
        </div>
    )
}
