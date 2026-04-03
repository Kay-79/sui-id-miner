/**
 * Shared Sui RPC utilities.
 *
 * In dev (Vite), all requests go through the local proxy to avoid CORS.
 * In production, calls go directly to the fullnodes.
 *
 * ALL RPC calls in the app should go through `withSuiFallback` so they
 * automatically retry across multiple public endpoints on transient errors.
 */

import { SuiClient } from '@mysten/sui/client'

type Network = 'mainnet' | 'testnet' | 'devnet'

// Ordered list of proxy paths (dev) or direct URLs (prod) per network.
const RPC_URLS: Record<Network, string[]> = {
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

/** Primary URL for the given network (used for tx.build referencing a client). */
export function getRpcUrl(network: Network): string {
    return RPC_URLS[network][0]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isTransientError(e: any): boolean {
    const status: number | undefined = e?.status ?? e?.response?.status
    // null/undefined status = network-level failure (ERR_NAME_NOT_RESOLVED, etc.)
    return status === 503 || status === 429 || status == null
}

/**
 * Execute `fn` against each RPC endpoint for the given network in order,
 * retrying on transient errors (503 / 429 / network failure) with a short
 * back-off. Throws only when every endpoint has been exhausted.
 *
 * Usage:
 *   const data = await withSuiFallback('testnet', (client) => client.getObject({ id }))
 */
export async function withSuiFallback<T>(
    network: Network,
    fn: (client: SuiClient) => Promise<T>
): Promise<T> {
    const urls = RPC_URLS[network]
    let lastError: unknown

    for (let i = 0; i < urls.length; i++) {
        try {
            const client = new SuiClient({ url: urls[i] })
            return await fn(client)
        } catch (e: any) {
            lastError = e
            if (isTransientError(e) && i < urls.length - 1) {
                await sleep(500 * (i + 1))
                continue
            }
            throw e
        }
    }

    throw lastError
}
