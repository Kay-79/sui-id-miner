import { useState, useEffect, useRef } from 'react'
import type { MiningProgress } from './useWebSocketMiner'

export function useSmoothStats(serverProgress: MiningProgress | null, isRunning: boolean) {
    const [smoothAttempts, setSmoothAttempts] = useState(0)

    const lastServerUpdate = useRef(Date.now())
    const lastServerAttempts = useRef(0)
    const animationFrameRef = useRef<number>(0)

    useEffect(() => {
        if (!serverProgress) {
            setSmoothAttempts(0)
            return
        }

        // On server update
        lastServerUpdate.current = Date.now()
        lastServerAttempts.current = serverProgress.attempts

        // If hashrate is 0, just snap to server value
        if (serverProgress.hashrate === 0) {
            setSmoothAttempts(serverProgress.attempts)
            return
        }

    }, [serverProgress])

    useEffect(() => {
        if (!isRunning || !serverProgress || serverProgress.hashrate === 0) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
            return
        }

        const animate = () => {
            const now = Date.now()
            const timeDiff = (now - lastServerUpdate.current) / 1000 // seconds

            // Predict current attempts: last_known + (hashrate * time_since_update)
            const predicted = Math.floor(lastServerAttempts.current + (serverProgress.hashrate * timeDiff))

            setSmoothAttempts(predicted)

            animationFrameRef.current = requestAnimationFrame(animate)
        }

        animationFrameRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [isRunning, serverProgress])

    return smoothAttempts
}
