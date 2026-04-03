import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
            // --- Mainnet ---
            '/sui-rpc/mainnet-1': {
                target: 'https://fullnode.mainnet.sui.io',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/mainnet-1/, ''),
            },
            '/sui-rpc/mainnet-2': {
                target: 'https://sui-mainnet-rpc.publicnode.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/mainnet-2/, ''),
            },

            // --- Testnet ---
            '/sui-rpc/testnet-1': {
                target: 'https://fullnode.testnet.sui.io',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/testnet-1/, ''),
            },
            '/sui-rpc/testnet-2': {
                target: 'https://sui-testnet-rpc.publicnode.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/testnet-2/, ''),
            },
            '/sui-rpc/testnet-3': {
                target: 'https://rpc-testnet.suiscan.xyz',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/testnet-3/, ''),
            },

            // --- Devnet ---
            '/sui-rpc/devnet-1': {
                target: 'https://fullnode.devnet.sui.io',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/sui-rpc\/devnet-1/, ''),
            },
        },
    },
})
