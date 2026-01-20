import { useState, useEffect } from 'react'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

interface UseBestGasCoinProps {
    sender: string
    network: 'mainnet' | 'testnet' | 'devnet'
    setGasObjectId: (id: string) => void
}

export function useBestGasCoin({ sender, network, setGasObjectId }: UseBestGasCoinProps) {
    const [statusMsg, setStatusMsg] = useState('')
    const [isFetching, setIsFetching] = useState(false)

    const fetchBestGasCoin = async () => {
        if (!sender || isFetching) return
        // Validate sender format (0x + 64 hex chars)
        if (!/^0x[a-fA-F0-9]{64}$/.test(sender)) return

        setIsFetching(true)
        setStatusMsg(`⏳ Finding best gas coin on ${network.toUpperCase()}...`)
        try {
            const client = new SuiClient({ url: getFullnodeUrl(network) })
            const coins = await client.getAllCoins({ owner: sender })

            if (coins.data.length === 0) {
                setStatusMsg('❌ No coins found for this address on ' + network.toUpperCase())
                return
            }

            // Find SUI coins and get the one with highest balance
            const suiCoins = coins.data.filter((c) => c.coinType === '0x2::sui::SUI')
            if (suiCoins.length === 0) {
                setStatusMsg('❌ No SUI coins found on ' + network.toUpperCase())
                return
            }

            // Sort by balance descending and pick the highest
            const bestCoin = suiCoins.reduce((max, coin) =>
                BigInt(coin.balance) > BigInt(max.balance) ? coin : max
            )

            setGasObjectId(bestCoin.coinObjectId)
            setStatusMsg(`✅ Found coin with ${(Number(bestCoin.balance) / 1e9).toFixed(4)} SUI`)
        } catch (e: any) {
            console.error(e)
            setStatusMsg('❌ ' + e.message)
        } finally {
            setIsFetching(false)
        }
    }

    // Auto-fetch best gas coin when sender changes (debounced)
    useEffect(() => {
        if (!sender || !/^0x[a-fA-F0-9]{64}$/.test(sender)) return
        // Skip if sender is all zeros (default)
        if (/^0x0+$/.test(sender)) return

        const timer = setTimeout(() => {
            fetchBestGasCoin()
        }, 500)

        return () => clearTimeout(timer)
    }, [sender, network])

    return { statusMsg, isFetching, fetchBestGasCoin }
}
