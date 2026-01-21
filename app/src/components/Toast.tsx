import type { Toast } from '../hooks/useToast'

interface ToastContainerProps {
    toasts: Toast[]
    removeToast: (id: number) => void
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
    if (toasts.length === 0) return null

    const getToastStyles = (type: Toast['type']) => {
        switch (type) {
            case 'error':
                return 'bg-red-500 border-red-700'
            case 'success':
                return 'bg-green-500 border-green-700'
            case 'warning':
                return 'bg-yellow-500 border-yellow-700'
            case 'info':
                return 'bg-blue-500 border-blue-700'
        }
    }

    const getIcon = (type: Toast['type']) => {
        switch (type) {
            case 'error':
                return '❌'
            case 'success':
                return '✅'
            case 'warning':
                return '⚠️'
            case 'info':
                return 'ℹ️'
        }
    }

    return (
        <div
            className="fixed top-4 right-4 flex flex-col gap-2 max-w-sm pointer-events-none"
            style={{ zIndex: 9999 }}
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`${getToastStyles(toast.type)} text-white px-4 py-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 animate-slide-in cursor-pointer pointer-events-auto`}
                    onClick={() => removeToast(toast.id)}
                >
                    <span>{getIcon(toast.type)}</span>
                    <span className="font-bold text-sm">{toast.message}</span>
                </div>
            ))}
        </div>
    )
}
