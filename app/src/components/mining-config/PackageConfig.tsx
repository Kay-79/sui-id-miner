import { useRef, useState } from 'react'
import SenderInput from './shared/SenderInput'
import GasSettings from './shared/GasSettings'
import GasObjectInput from './shared/GasObjectInput'

interface PackageConfigProps {
    sender: string
    setSender: (s: string) => void
    baseGasBudget: number
    setBaseGasBudget: (val: number) => void
    setModulesBase64: (modules: string[]) => void
    modulesBase64: string[]
    gasObjectId: string
    setGasObjectId: (id: string) => void
    network: 'mainnet' | 'testnet' | 'devnet'
    setNetwork: (n: 'mainnet' | 'testnet' | 'devnet') => void
    isRunning: boolean
}

export default function PackageConfig({
    sender,
    setSender,
    baseGasBudget,
    setBaseGasBudget,
    gasObjectId,
    setGasObjectId,
    network,
    setNetwork,
    modulesBase64,
    setModulesBase64,
    isRunning,
}: PackageConfigProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [fileStatusMsg, setFileStatusMsg] = useState('')

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

    return (
        <div className="space-y-4 p-4 bg-gray-50 border-2 border-dashed border-gray-300">
            <SenderInput
                value={sender}
                onChange={setSender}
            />

            <GasSettings
                gasBudget={baseGasBudget}
                setGasBudget={setBaseGasBudget}
                disabled={isRunning}
            />

            <GasObjectInput
                objectId={gasObjectId}
                setObjectId={setGasObjectId}
                sender={sender}
                network={network}
                setNetwork={setNetwork}
                disabled={isRunning}
                borderColorClass="border-blue-200"
            />

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
            </div>
        </div>
    )
}

