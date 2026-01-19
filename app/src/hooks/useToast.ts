import { useState } from 'react'

export interface Toast {
    id: number
    message: string
    type: 'error' | 'success' | 'warning' | 'info'
}

let toastId = 0

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    const showToast = (message: string, type: Toast['type'] = 'error') => {
        const id = ++toastId
        setToasts((prev) => [...prev, { id, message, type }])

        // Auto-remove after 3 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 3000)
    }

    const removeToast = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }

    return { toasts, showToast, removeToast }
}
