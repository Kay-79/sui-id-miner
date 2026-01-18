export default function Header() {
    return (
        <div className="max-w-4xl mx-auto mb-8 text-center md:text-left">
            <h1 className="heading-xl flex items-center justify-center md:justify-start gap-3">
                <span className="text-4xl text-[var(--primary)]">⛏️</span> 
                Sui ID Miner
            </h1>
            <p className="text-lg text-gray-600 font-medium mt-2">
                Package ID generator on SUI
            </p>
        </div>
    )
}
