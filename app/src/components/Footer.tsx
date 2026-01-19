interface FooterProps {
    mode: 'ADDRESS' | 'PACKAGE'
}

export default function Footer({ mode }: FooterProps) {
    return (
        <div className="text-center text-sm text-gray-500 mt-4 pb-8">
            <p className="mt-1">
                {mode === 'ADDRESS'
                    ? '🔒 Private keys are generated locally in your browser and NEVER leave your device.'
                    : '📦 Make Package ID cooler!'}
            </p>
        </div>
    )
}
