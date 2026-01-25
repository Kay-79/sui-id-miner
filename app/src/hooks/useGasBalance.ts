import { useState, useEffect } from 'react'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

export function useGasBalance(objectId: string, network: 'mainnet' | 'testnet' | 'devnet') {
    const [balance, setBalance] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        // Reset if invalid ID
        if (!objectId || !objectId.startsWith('0x') || objectId.length < 60) {
            // relaxed length check slightly
            setBalance(null)
            return
        }

        let isMounted = true
        const fetchBalance = async () => {
            setLoading(true)
            setError('')
            try {
                const client = new SuiClient({ url: getFullnodeUrl(network) })
                const obj = await client.getObject({
                    id: objectId,
                    options: { showContent: true },
                })

                if (obj.data?.content?.dataType === 'moveObject') {
                    const fields = obj.data.content.fields as any
                    if (fields && 'balance' in fields) {
                        if (isMounted) setBalance(Number(fields.balance))
                    } else {
                        if (isMounted) setBalance(null)
                    }
                } else {
                    if (isMounted) setBalance(null)
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message)
                    setBalance(null)
                }
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        const timeoutId = setTimeout(fetchBalance, 500)

        return () => {
            isMounted = false
            clearTimeout(timeoutId)
        }
    }, [objectId, network])

    return { balance, loading, error }
}
