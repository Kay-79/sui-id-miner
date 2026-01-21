import { useRef, useState } from 'react'
import { useBestGasCoin } from '../../hooks/useBestGasCoin'

interface PackageConfigProps {
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
    modulesBase64: string[]
    setModulesBase64: (modules: string[]) => void
    isRunning: boolean
}

export default function PackageConfig({
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
    modulesBase64,
    setModulesBase64,
    isRunning
}: PackageConfigProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [fileStatusMsg, setFileStatusMsg] = useState('')

    // Use the hook for gas coin logic
    const { statusMsg: gasStatusMsg } = useBestGasCoin({
        sender,
        network,
        setGasObjectId
    })

    // Read .mv files and convert to Base64
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        setFileStatusMsg('Reading modules...')

        try {
            // Collect .mv files with their names for sorting
            const fileList: { name: string; file: File }[] = []

            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i]
                const fileName = file.name

                if (!fileName.endsWith('.mv')) continue

                const relativePath = (file as any).webkitRelativePath || ''
                if (
                    relativePath.includes('/dependencies/') ||
                    relativePath.includes('\\dependencies\\')
                ) {
                    console.log(`Skipping dependency: ${relativePath}`)
                    continue
                }

                const baseName = fileName.replace('.mv', '')
                if (baseName.endsWith('_tests') || baseName.endsWith('_test')) {
                    console.log(`Skipping test module: ${fileName}`)
                    continue
                }

                fileList.push({ name: fileName, file })
            }

            if (fileList.length === 0) {
                setFileStatusMsg('❌ No .mv files found (excluding tests)!')
                return
            }

            fileList.sort((a, b) => a.name.localeCompare(b.name))

            const modules: string[] = []
            for (const { file } of fileList) {
                const buffer = await file.arrayBuffer()
                const bytes = new Uint8Array(buffer)
                let binary = ''
                for (let j = 0; j < bytes.byteLength; j++) {
                    binary += String.fromCharCode(bytes[j])
                }
                modules.push(btoa(binary))
            }

            const moduleNames = fileList.map((f) => f.name.replace('.mv', '')).join(', ')
            setModulesBase64(modules)
            setFileStatusMsg(`✅ Loaded ${modules.length} module(s): ${moduleNames}`)
        } catch (err: any) {
            console.error(err)
            setFileStatusMsg('❌ Error reading files: ' + err.message)
        }
    }

    const handleSenderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Allow empty
        if (val === '') {
            setSender(val)
            return
        }
        // Strict hex validation: 0, 0x, or 0x[hex]
        if (/^(0|0x|0x[0-9a-fA-F]*)$/.test(val)) {
            setSender(val)
        }
    }

    return (
        <div className="space-y-4 p-4 bg-gray-50 border-2 border-dashed border-gray-300">
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
                            disabled={isRunning}
                            placeholder="Auto"
                        />
                    </div>
                </div>
            </div>

            {/* Gas Object */}
            <div className="p-3 bg-white border border-blue-200 rounded">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold uppercase">Gas Object</h4>
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

            {/* Modules */}
            <div className="p-3 bg-white border border-green-200 rounded">
                <h4 className="text-xs font-bold uppercase mb-2">Move Modules</h4>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <label className="brutal-btn cursor-pointer bg-green-600 text-white text-sm py-1 px-3">
                            🗃️ Upload Modules
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".mv"
                                multiple
                            />
                        </label>
                        <span className="text-xs text-gray-500">(.mv files)</span>
                    </div>
                    <span className="text-xs font-bold text-[var(--primary)]">
                        {modulesBase64.length > 0
                            ? `${modulesBase64.length} module(s)`
                            : ''}
                    </span>
                </div>
                {fileStatusMsg && <p className="text-xs mt-2 font-medium">{fileStatusMsg}</p>}
                {gasStatusMsg && <p className="text-xs mt-2 font-medium">{gasStatusMsg}</p>}
            </div>
        </div>
    )
}
