export default function Docs() {
    return (
        <div className="card space-y-8 animate-fade-in">
            <div className="border-b-4 border-black pb-4">
                <h2 className="heading-lg">User Guide</h2>
                <p className="text-gray-600 mt-2">
                    Learn how to configure and use Sui Vanity ID effectively.
                </p>
            </div>

            {/* CLI Guide */}
            <section className="space-y-4">
                <h3 className="heading-md flex items-center gap-2">
                    <span className="bg-black text-white px-2 py-0.5 text-sm rounded-sm">CLI</span>
                    Command Line Usage
                </h3>
                <p>
                    The CLI is the most powerful way to use the miner, supporting automation and headless operation.
                </p>

                <div className="bg-gray-100 p-4 border-2 border-black rounded-lg space-y-4 font-mono text-sm overflow-x-auto">
                    <div>
                        <p className="text-gray-500 mb-1"># 1. Mine Package ID</p>
                        <p>cargo run --release -- package --prefix cafe --module ./build/MyPackage/bytecode_modules --sender 0x...</p>
                    </div>
                    <div>
                        <p className="text-gray-500 mb-1"># 2. Mine Gas Coin ID (Split Coin)</p>
                        <p>cargo run --release -- gas --prefix aaaa --split-amounts 1000000,1000000 --sender 0x...</p>
                    </div>
                    <div>
                        <p className="text-gray-500 mb-1"># 3. Mine Move Call ID</p>
                        <p>cargo run --release -- move --prefix 0000 --tx-base64 AAAB... --object-index 0</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-2 border-black">
                        <thead className="bg-black text-white">
                            <tr>
                                <th className="p-2">Flag</th>
                                <th className="p-2">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-black">
                            <tr>
                                <td className="p-2 font-mono">--prefix</td>
                                <td className="p-2">Hex string to search for (without 0x)</td>
                            </tr>
                            <tr>
                                <td className="p-2 font-mono">--threads</td>
                                <td className="p-2">Number of CPU threads (Default: All)</td>
                            </tr>
                            <tr>
                                <td className="p-2 font-mono">--sender</td>
                                <td className="p-2">Sender address for the transaction</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <hr className="border-2 border-black border-dashed" />

            {/* Web UI Guide */}
            <section className="space-y-4">
                <h3 className="heading-md flex items-center gap-2">
                    <span className="bg-[var(--primary)] text-black px-2 py-0.5 text-sm rounded-sm border-2 border-black">WEB</span>
                    Web Interface Usage
                </h3>

                <ol className="list-decimal list-inside space-y-2 marker:font-bold">
                    <li>
                        <strong>Start the Server:</strong> You must run the local server first to handle the heavy generation work ("mining").
                        <div className="bg-gray-900 text-white p-2 mt-1 rounded font-mono text-sm">
                            cd cli && cargo run --release -- --server
                        </div>
                    </li>
                    <li><strong>Connect:</strong> Click the "Connect local server" button.</li>
                    <li><strong>Select Mode:</strong> Choose between Package, Gas Coin, or Move Call.</li>
                    <li><strong>Configure:</strong> Fill in the required fields (Sender, Gas Object, etc.).</li>
                    <li><strong>Start:</strong> Click "Start Generation" and watch the progress!</li>
                </ol>
            </section>

            <hr className="border-2 border-black border-dashed" />

            {/* Tips */}
            <section className="space-y-4">
                <h3 className="heading-md">💡 Pro Tips</h3>
                <ul className="space-y-2">
                    <li className="flex gap-2">
                        <span className="font-bold">Difficulty:</span>
                        <span>Each additional character increases difficulty by 16x.</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="font-bold">Gas Object:</span>
                        <span>Ensure sufficient balance. Avoid spending from this object during generation.</span>
                    </li>
                </ul>
            </section>
        </div>
    )
}
