import { useState } from 'react'
import type { FoundResult } from '../types'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

// --- Interfaces ---
interface ResultsListProps {
  results: FoundResult[]
  clearResults: () => void
  sender: string
  network: 'mainnet' | 'testnet' | 'devnet'
}

// --- Helper Utilities ---
function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K'
  return n.toFixed(0)
}

const RESULT_CONFIG = {
  GAS_COIN: {
    label: '🪙 GAS COIN',
    theme: 'amber',
    bgBadge: 'bg-amber-500',
    textId: 'text-amber-600',
    bgBox: 'bg-amber-50',
    borderBox: 'border-amber-200',
    actionTitle: 'To create this coin:',
  },
  MOVE_CALL: {
    label: '⚡ MOVE CALL',
    theme: 'purple',
    bgBadge: 'bg-purple-600',
    textId: 'text-purple-600',
    bgBox: 'bg-purple-50',
    borderBox: 'border-purple-200',
    actionTitle: 'To execute this call:',
  },
  PACKAGE: {
    label: '📦 PACKAGE',
    theme: 'gray',
    bgBadge: 'bg-black',
    textId: 'text-[var(--accent)]',
    bgBox: 'bg-gray-100',
    borderBox: 'border-gray-300',
    actionTitle: 'To publish this package:',
  },
}

// --- Sub-Components ---

function CopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`text-[10px] font-bold px-1.5 py-0.5 border border-black transition-all ${
        copied ? 'bg-green-500 text-white' : 'bg-white hover:bg-gray-50'
      }`}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

function GasAvailabilityCheck({
  gasObjectId,
  savedVersion,
  network,
}: {
  gasObjectId: string
  savedVersion?: string
  network: string
}) {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | null>(null)

  const checkAvailability = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!gasObjectId) return

    setStatus('checking')
    try {
      const client = new SuiClient({ url: getFullnodeUrl(network as any) })
      const data = await client.getObject({ id: gasObjectId })

      if (data.data) {
        if (savedVersion && data.data.version !== savedVersion) {
          setStatus('invalid')
        } else {
          setStatus('valid')
          setTimeout(() => setStatus(null), 5000) 
        }
      } else {
        setStatus('invalid')
      }
    } catch {
      setStatus('invalid')
    }
  }

  const getButtonStyles = () => {
    if (status === 'checking') return 'bg-gray-300 text-gray-600'
    if (status === 'valid') return 'bg-green-500 text-white'
    if (status === 'invalid') return 'bg-red-500 text-white'
    return 'bg-blue-500 text-white hover:bg-blue-600' // Default check style
  }

  const getButtonText = () => {
    if (status === 'checking') return '⏳'
    if (status === 'valid') return '✓ Valid'
    if (status === 'invalid') return '✗ Changed/Missing'
    return '🔍 Check'
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-bold text-gray-500">GAS OBJECT:</span>
      <span className="font-mono text-gray-600">
        {gasObjectId.slice(0, 10)}...{gasObjectId.slice(-6)}
      </span>
      <button
        onClick={checkAvailability}
        disabled={status === 'checking'}
        className={`font-bold px-2 py-0.5 border border-black transition-all ${getButtonStyles()}`}
      >
        {getButtonText()}
      </button>
    </div>
  )
}

function ActionInstructions({
  title,
  sender,
  txBytesBase64,
  config,
}: {
  title: string
  sender: string
  txBytesBase64: string
  config: typeof RESULT_CONFIG.GAS_COIN // Any config type works
}) {
  const signCommand = `sui keytool sign --address ${sender} --data ${txBytesBase64}`
  const executeCommand = `sui client execute-signed-tx --tx-bytes ${txBytesBase64} --signatures <suiSignature>`

  const StepRow = ({
    step,
    label,
    cmd,
    badgeColor,
  }: {
    step: number
    label: string
    cmd: string
    badgeColor: string
  }) => (
    <div className="flex items-start gap-2">
      <span className={`${badgeColor} text-white text-[10px] px-1.5 py-0.5 rounded font-bold`}>
        {step}
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">{label}</span>
          <CopyButton command={cmd} />
        </div>
      </div>
    </div>
  )

  const stepBadgeColor = config.theme === 'gray' ? 'bg-black' : config.bgBadge

  return (
    <div className={`p-3 ${config.bgBox} border ${config.borderBox} text-xs space-y-2`}>
      <p className="font-bold text-gray-600">📝 {title}</p>
      <StepRow step={1} label="Sign transaction" cmd={signCommand} badgeColor={stepBadgeColor} />
      <StepRow step={2} label="Execute signed tx" cmd={executeCommand} badgeColor={stepBadgeColor} />
    </div>
  )
}

function ResultItem({
  result,
  isExpanded,
  onToggle,
  sender,
  network,
}: {
  result: FoundResult
  isExpanded: boolean
  onToggle: () => void
  sender: string
  network: string
}) {
  const resultType = result.type === 'GAS_COIN' ? 'GAS_COIN' : result.type === 'MOVE_CALL' ? 'MOVE_CALL' : 'PACKAGE'
  const config = RESULT_CONFIG[resultType]

  const displayId = (result.type === 'GAS_COIN' || result.type === 'MOVE_CALL') ? result.objectId : result.packageId
  const safeId = displayId || ''

  return (
    <div className="bg-gray-50 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {/* Header - Always visible */}
      <div className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={onToggle}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className={`text-xl transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded text-white ${config.bgBadge}`}>
              {config.label}
            </span>
            <span className={`font-mono text-sm font-bold ${config.textId}`}>
              {safeId.slice(0, 20)}...{safeId.slice(-8)}
            </span>
          </div>
          <span className="text-xs text-gray-500">{formatNumber(result.attempts)} attempts</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-0 border-t-2 border-dashed border-gray-300">
          <div className="pt-3 space-y-3">
            {/* Common Details: ID */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">
                {result.type === 'PACKAGE' ? 'PACKAGE ID:' : 'OBJECT ID:'}
              </span>
              <span className={`font-mono text-sm font-bold break-all ${config.textId}`}>
                {safeId}
              </span>
            </div>

            {/* Optional: Index (for Gas/Move) */}
            {result.objectIndex !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">INDEX:</span>
                <span className="font-mono">{result.objectIndex}</span>
              </div>
            )}

            {/* Optional: Gas Check (For Package/Gas Coin) */}
            {result.gasObjectId && (
              <GasAvailabilityCheck
                gasObjectId={result.gasObjectId}
                savedVersion={result.gasObjectVersion}
                network={network}
              />
            )}

            {/* Action Instructions */}
            <ActionInstructions
              title={config.actionTitle}
              sender={sender}
              txBytesBase64={result.txBytesBase64 || ''}
              config={config}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main Component ---
export default function ResultsList({ results, clearResults, sender, network }: ResultsListProps) {
  if (results.length === 0) return null

  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set())

  const toggleExpand = (idx: number) => {
    setExpandedResults((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(idx)) newSet.delete(idx)
      else newSet.add(idx)
      return newSet
    })
  }

  const expandAll = () => setExpandedResults(new Set(results.map((_, i) => i)))
  const collapseAll = () => setExpandedResults(new Set())

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
        {results.map((result, idx) => (
          <ResultItem
            key={idx}
            result={result}
            isExpanded={expandedResults.has(idx)}
            onToggle={() => toggleExpand(idx)}
            sender={sender}
            network={network}
          />
        ))}
      </div>
    </div>
  )
}