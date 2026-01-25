import { useBestGasCoin } from '../../../hooks/useBestGasCoin'

interface GasObjectInputProps {
    objectId: string
    setObjectId: (id: string) => void
    sender: string
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    disabled?: boolean
    borderColorClass?: string // Allow customization of border color (e.g. 'border-blue-200')
}

export default function GasObjectInput({
    objectId,
    setObjectId,
    sender,
    network,
    setNetwork,
    disabled,
    borderColorClass = 'border-gray-200',
}: GasObjectInputProps) {
    const { statusMsg } = useBestGasCoin({
        sender,
        network,
        setGasObjectId: setObjectId,
    })

    return (
        <div className={`p-3 bg-white border ${borderColorClass} rounded`}>
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold uppercase">Gas Object</h4>
                <div className="flex gap-1">
                    {(['mainnet', 'testnet', 'devnet'] as const).map((net) => (
                        <button
                            key={net}
                            onClick={() => setNetwork(net)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border border-black ${
                                network === net
                                    ? 'bg-black text-white'
                                    : 'bg-white text-black hover:bg-gray-100'
                            }`}
                            disabled={disabled}
                        >
                            {net}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid gap-2">
                <input
                    type="text"
                    value={objectId}
                    onChange={(e) => setObjectId(e.target.value)}
                    className="brutal-input text-xs font-mono py-1"
                    placeholder="Object ID (0x...) - fetched automatically"
                    maxLength={66}
                    disabled={disabled}
                />
            </div>
            {statusMsg && <p className="text-xs mt-2 font-medium">{statusMsg}</p>}
        </div>
    )
}
