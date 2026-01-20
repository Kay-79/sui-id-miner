import { useState } from 'react'
import type { FoundResult } from '../types'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

interface ResultsListProps {
    results: FoundResult[]
    clearResults: () => void
    sender: string
    network: 'mainnet' | 'testnet' | 'devnet'
}

function formatNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(0)
}

export default function ResultsList({ results, clearResults, sender, network }: ResultsListProps) {
    if (results.length === 0) return null

    const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
    const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set())
    const [checkingStatus, setCheckingStatus] = useState<Record<number, 'checking' | 'valid' | 'invalid' | null>>({})

    const toggleExpand = (idx: number) => {
        setExpandedResults((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(idx)) {
                newSet.delete(idx)
            } else {
                newSet.add(idx)
            }
            return newSet
        })
    }

    const expandAll = () => {
        setExpandedResults(new Set(results.map((_, i) => i)))
    }

    const collapseAll = () => {
        setExpandedResults(new Set())
    }

    const copyCommand = async (idx: number, txBytes: string) => {
        const command = `sui keytool sign --address ${sender} --data ${txBytes}`
        await navigator.clipboard.writeText(command)
        setCopiedCommand(`sign-${idx}`)
        setTimeout(() => setCopiedCommand(null), 2000)
    }

    const copyPublishCommand = async (idx: number, txBytes: string) => {
        const command = `sui client execute-signed-tx --tx-bytes ${txBytes} --signatures <suiSignature>`
        await navigator.clipboard.writeText(command)
        setCopiedCommand(`publish-${idx}`)
        setTimeout(() => setCopiedCommand(null), 2000)
    }

    const checkAvailability = async (idx: number, gasObjectId: string, savedVersion?: string) => {
        if (!gasObjectId) return

        setCheckingStatus(prev => ({ ...prev, [idx]: 'checking' }))

        try {
            const client = new SuiClient({ url: getFullnodeUrl(network) })
            const data = await client.getObject({ id: gasObjectId })

            if (data.data) {
                // Check if version matches (if we have saved version)
                if (savedVersion && data.data.version !== savedVersion) {
                    // Version changed - tx is no longer valid
                    setCheckingStatus(prev => ({ ...prev, [idx]: 'invalid' }))
                } else {
                    // Same version or no saved version - still valid
                    setCheckingStatus(prev => ({ ...prev, [idx]: 'valid' }))
                }
            } else {
                setCheckingStatus(prev => ({ ...prev, [idx]: 'invalid' }))
            }
        } catch {
            setCheckingStatus(prev => ({ ...prev, [idx]: 'invalid' }))
        }

        // Only reset status after 5 seconds if valid (keep 'invalid' permanently)
        setTimeout(() => {
            setCheckingStatus(prev => {
                if (prev[idx] === 'valid') {
                    return { ...prev, [idx]: null }
                }
                return prev // Keep 'invalid' or 'checking' status
            })
        }, 5000)
    }

    return (
        <div className="brutal-card p-6 border-[var(--success)]">
            <div className="flex items-center justify-between mb-4">
                <h2 className="heading-lg flex items-center gap-2">🎉 Found ({results.length})</h2>
                <div className="flex gap-2">
                    <button
                        onClick={expandAll}
                        className="text-xs font-bold px-2 py-1 border-2 border-black bg-white hover:bg-gray-100"
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        className="text-xs font-bold px-2 py-1 border-2 border-black bg-white hover:bg-gray-100"
                    >
                        Collapse All
                    </button>
                    <button
                        onClick={clearResults}
                        className="brutal-btn brutal-btn-secondary text-sm py-2 px-3"
                    >
                        Clear
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {results.map((result, idx) => {
                    const isExpanded = expandedResults.has(idx)
                    const displayId = result.packageId || ''

                    return (
                        <div
                            key={idx}
                            className="bg-gray-50 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                        >
                            {/* Collapsed Header - Always visible */}
                            <div
                                className="p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => toggleExpand(idx)}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`text-xl transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                        >
                                            ▶
                                        </span>
                                        <span className="text-xs font-bold bg-black text-white px-2 py-0.5 rounded">
                                            PACKAGE
                                        </span>
                                        <span className="font-mono text-sm font-bold text-[var(--accent)]">
                                            {displayId.slice(0, 20)}...{displayId.slice(-8)}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {formatNumber(result.attempts)} attempts
                                    </span>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="p-4 pt-0 border-t-2 border-dashed border-gray-300">

                                    {/* PACKAGE MODE RESULT */}
                                    {result.packageId && (
                                        <div className="pt-3 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">
                                                    PACKAGE ID:
                                                </span>
                                                <span className="font-mono text-sm font-bold text-[var(--accent)] break-all">
                                                    {result.packageId}
                                                </span>
                                            </div>

                                            {/* Gas Object Check */}
                                            {result.gasObjectId && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="font-bold text-gray-500">
                                                        GAS OBJECT:
                                                    </span>
                                                    <span className="font-mono text-gray-600">
                                                        {result.gasObjectId.slice(0, 10)}...{result.gasObjectId.slice(-6)}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            checkAvailability(idx, result.gasObjectId || '', result.gasObjectVersion)
                                                        }}
                                                        disabled={checkingStatus[idx] === 'checking'}
                                                        className={`font-bold px-2 py-0.5 border border-black transition-all ${checkingStatus[idx] === 'checking'
                                                                ? 'bg-gray-300 text-gray-600'
                                                                : checkingStatus[idx] === 'valid'
                                                                    ? 'bg-green-500 text-white'
                                                                    : checkingStatus[idx] === 'invalid'
                                                                        ? 'bg-red-500 text-white'
                                                                        : 'bg-blue-500 text-white hover:bg-blue-600'
                                                            }`}
                                                    >
                                                        {checkingStatus[idx] === 'checking'
                                                            ? '⏳'
                                                            : checkingStatus[idx] === 'valid'
                                                                ? '✓ Valid'
                                                                : checkingStatus[idx] === 'invalid'
                                                                    ? '✗ Changed or published'
                                                                    : '🔍 Check'}
                                                    </button>
                                                </div>
                                            )}

                                            <div className="p-3 bg-gray-100 border border-gray-300 text-xs space-y-2">
                                                <p className="font-bold text-gray-600">
                                                    📝 To publish this package:
                                                </p>

                                                {/* Step 1: Sign */}
                                                <div className="flex items-start gap-2">
                                                    <span className="bg-black text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                                        1
                                                    </span>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium">
                                                                Sign transaction
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    copyCommand(
                                                                        idx,
                                                                        result.txBytesBase64 || ''
                                                                    )
                                                                }}
                                                                className={`text-[10px] font-bold px-1.5 py-0.5 border border-black transition-all ${copiedCommand === `sign-${idx}`
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-white hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                {copiedCommand === `sign-${idx}`
                                                                    ? '✓'
                                                                    : 'Copy'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Step 2: Execute */}
                                                <div className="flex items-start gap-2">
                                                    <span className="bg-black text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                                        2
                                                    </span>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium">
                                                                Execute signed tx
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    copyPublishCommand(
                                                                        idx,
                                                                        result.txBytesBase64 || ''
                                                                    )
                                                                }}
                                                                className={`text-[10px] font-bold px-1.5 py-0.5 border border-black transition-all ${copiedCommand ===
                                                                        `publish-${idx}`
                                                                        ? 'bg-green-500 text-white'
                                                                        : 'bg-white hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                {copiedCommand === `publish-${idx}`
                                                                    ? '✓'
                                                                    : 'Copy'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
