import { useState, useEffect } from 'react'
import { SuiClient } from '@mysten/sui/client'

type Network = 'mainnet' | 'testnet' | 'devnet'

/**
 * RPC endpoint lists per network.
 * In dev: all calls go through Vite's proxy (same-origin) → no CORS.
 * In prod: call the fullnode URLs directly (browser CORS is fine on deployed hosts,
 *          or add Vercel rewrites if needed).
 */
const RPC_ENDPOINTS: Record<Network, string[]> = {
    mainnet: import.meta.env.DEV
        ? ['/sui-rpc/mainnet-1/', '/sui-rpc/mainnet-2/']
        : ['https://fullnode.mainnet.sui.io/', 'https://sui-mainnet-rpc.publicnode.com/'],

    testnet: import.meta.env.DEV
        ? ['/sui-rpc/testnet-1/', '/sui-rpc/testnet-2/', '/sui-rpc/testnet-3/']
        : [
              'https://fullnode.testnet.sui.io/',
              'https://sui-testnet-rpc.publicnode.com/',
              'https://rpc-testnet.suiscan.xyz/',
          ],

    devnet: import.meta.env.DEV
        ? ['/sui-rpc/devnet-1/']
        : ['https://fullnode.devnet.sui.io/'],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Try each RPC endpoint in order. On a transient error (503 / 429 / network failure)
 * waits briefly then moves to the next URL. Throws only when all endpoints fail.
 */
async function getAllCoinsWithFallback(network: Network, owner: string) {
    const urls = RPC_ENDPOINTS[network]
    let lastError: unknown

    for (let i = 0; i < urls.length; i++) {
        try {
            const client = new SuiClient({ url: urls[i] })
            return await client.getAllCoins({ owner })
        } catch (e: any) {
            lastError = e
            const status: number | undefined = e?.status ?? e?.response?.status
            const isTransient = status === 503 || status === 429 || status == null
            if (isTransient && i < urls.length - 1) {
                // Brief backoff before trying next endpoint
                await sleep(500 * (i + 1))
                continue
            }
            // Non-transient error (e.g. 400) — no point retrying
            throw e
        }
    }

    throw lastError
}

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
            const coins = await getAllCoinsWithFallback(network, sender)

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
                setStatusMsg('❌ Rate limited by RPC node. Try again shortly.')
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
