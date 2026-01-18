import { useEffect, useState } from 'react';

export default function Header() {
    const [stars, setStars] = useState<number | null>(null);

    useEffect(() => {
        fetch('https://api.github.com/repos/Kay-79/sui-id-miner')
            .then(res => res.json())
            .then(data => {
                if (data.stargazers_count !== undefined) {
                    setStars(data.stargazers_count);
                }
            })
            .catch(() => {});
    }, []);

    return (
        <div className="max-w-4xl mx-auto mb-8">
            <div className="flex items-center justify-between">
                <div className="text-center md:text-left">
                    <h1 className="heading-xl flex items-center justify-center md:justify-start gap-3">
                        <img src="/logo.svg" alt="Sui ID Miner" className="w-12 h-12" />
                        Sui ID Miner
                    </h1>
                    <p className="text-lg text-gray-600 font-medium mt-2">
                        Package ID generator on SUI
                    </p>
                </div>
                
                <a
                    href="https://github.com/Kay-79/sui-id-miner"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="github-badge"
                    title="Star on GitHub"
                >
                    <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    {stars !== null && (
                        <span className="star-count">
                            <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
                                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                            </svg>
                            {stars}
                        </span>
                    )}
                </a>
            </div>
        </div>
    )
}
