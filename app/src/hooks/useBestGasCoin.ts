import { useState, useEffect } from 'react'
import { withSuiFallback } from '../lib/rpc'

type Network = 'mainnet' | 'testnet' | 'devnet'

interface UseBestGasCoinProps {
    sender: string
    network: Network
    setGasObjectId: (id: string) => void
}

export function useBestGasCoin({ sender, network, setGasObjectId }: UseBestGasCoinProps) {
    const [statusMsg, setStatusMsg] = useState('')
    const [isFetching, setIsFetching] = useState(false)

    const fetchBestGasCoin = async () => {
        if (!sender || isFetching) return
        if (!/^0x[a-fA-F0-9]{64}$/.test(sender)) return

        setIsFetching(true)
        setStatusMsg(`⏳ Finding best gas coin on ${network.toUpperCase()}...`)
        try {
            const coins = await withSuiFallback(network, (client) =>
                client.getAllCoins({ owner: sender })
            )

            if (coins.data.length === 0) {
                setStatusMsg('❌ No coins found for this address on ' + network.toUpperCase())
                return
            }

            const suiCoins = coins.data.filter((c) => c.coinType === '0x2::sui::SUI')
            if (suiCoins.length === 0) {
                setStatusMsg('❌ No SUI coins found on ' + network.toUpperCase())
                return
            }

            const bestCoin = suiCoins.reduce((max, coin) =>
                BigInt(coin.balance) > BigInt(max.balance) ? coin : max
            )

            setGasObjectId(bestCoin.coinObjectId)
            setStatusMsg(`✅ Found coin with ${(Number(bestCoin.balance) / 1e9).toFixed(4)} SUI`)
        } catch (e: any) {
            console.error('[useBestGasCoin] All RPC endpoints failed:', e)
            const status: number | undefined = e?.status ?? e?.response?.status
            if (status === 503) {
                setStatusMsg('❌ All RPC nodes unavailable (503). Try again in a moment.')
            } else if (status === 429) {
                setStatusMsg('❌ Rate limited. Try again shortly.')
            } else {
                setStatusMsg('❌ ' + (e?.message ?? 'Unknown error'))
            }
        } finally {
            setIsFetching(false)
        }
    }

    useEffect(() => {
        if (!sender || !/^0x[a-fA-F0-9]{64}$/.test(sender)) return
        if (/^0x0+$/.test(sender)) return

        const timer = setTimeout(() => {
            fetchBestGasCoin()
        }, 500)

        return () => clearTimeout(timer)
    }, [sender, network])

    return { statusMsg, isFetching, fetchBestGasCoin }
}
