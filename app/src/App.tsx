import { useState, useCallback, useEffect } from "react";
import "./App.css";
import "./index.css";

import type { MiningMode, MiningState, FoundResult } from "./types";
import Header from "./components/Header";
import Footer from "./components/Footer";
// import ModeSwitcher from "./components/ModeSwitcher";
import ConfigCard from "./components/ConfigCard";
import MiningControl from "./components/MiningControl";
import ResultsList from "./components/ResultsList";
import { useWebSocketMiner } from "./hooks/useWebSocketMiner";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/Toast";

function App() {
    // Config State
    const [mode, _setMode] = useState<MiningMode>("PACKAGE");
    const [prefix, setPrefix] = useState("");

    // Package Mode Specific Config
    const [baseGasBudget, setBaseGasBudget] = useState(100000000);

    // Package Mode: Module storage + Gas Object
    const [modulesBase64, setModulesBase64] = useState<string[]>([]);
    const [sender, setSender] = useState(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    const [gasObjectId, setGasObjectId] = useState("");
    const [gasObjectVersion, setGasObjectVersion] = useState("");
    const [gasObjectDigest, setGasObjectDigest] = useState("");

    // WebSocket Miner
    const wsMiner = useWebSocketMiner();

    // Toast
    const { toasts, showToast, removeToast } = useToast();

    // Results State
    const [state, setState] = useState<MiningState>({
        isRunning: false,
        attempts: 0,
        hashrate: 0,
        startTime: null,
        foundResults: [],
    });

    // Computed
    const difficulty = prefix.length;
    const estimatedAttempts = Math.pow(16, difficulty);
    const isValidPrefix = prefix.length > 0 && /^[0-9a-fA-F]+$/.test(prefix);

    const isConfigValid =
        mode === "ADDRESS"
            ? isValidPrefix
            : isValidPrefix &&
              modulesBase64.length > 0 &&
              gasObjectId &&
              gasObjectVersion &&
              gasObjectDigest;

    // Track WebSocket results -> add to foundResults
    // This is a valid pattern: syncing external WebSocket state with React state
    useEffect(() => {
        if (wsMiner.packageResult) {
            const result: FoundResult = {
                type: "PACKAGE",
                packageId: wsMiner.packageResult.packageId,
                txDigest: wsMiner.packageResult.txDigest,
                txBytesBase64: wsMiner.packageResult.txBytesBase64,
                attempts: wsMiner.packageResult.attempts,
                timestamp: Date.now(),
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
            setState((prev) => ({
                ...prev,
                foundResults: [...prev.foundResults, result],
            }));
        }
    }, [wsMiner.packageResult]);

    useEffect(() => {
        if (wsMiner.addressResult) {
            const result: FoundResult = {
                type: "ADDRESS",
                address: wsMiner.addressResult.address,
                private_key: wsMiner.addressResult.privateKey,
                public_key: wsMiner.addressResult.publicKey,
                attempts: wsMiner.addressResult.attempts,
                timestamp: Date.now(),
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
            setState((prev) => ({
                ...prev,
                foundResults: [...prev.foundResults, result],
            }));
        }
    }, [wsMiner.addressResult]);

    // Actions
    const startMining = useCallback(() => {
        // Validate and show toast for missing fields
        if (!wsMiner.isConnected) {
            showToast("Please connect to the server first!", "error");
            return;
        }

        if (!isValidPrefix) {
            showToast("Please enter a valid hex prefix!", "error");
            return;
        }

        if (mode === "PACKAGE") {
            // Check if sender is zero address
            if (/^0x0+$/.test(sender)) {
                showToast("Please set Sender Address!", "error");
                return;
            }
            if (modulesBase64.length === 0) {
                showToast("Please upload .mv module files!", "error");
                return;
            }
            if (!gasObjectId) {
                showToast("Please enter Gas Object ID or change network!", "error");
                return;
            }
            if (!gasObjectVersion) {
                showToast("Gas Object Version is missing!", "error");
                return;
            }
            if (!gasObjectDigest) {
                showToast("Gas Object Digest is missing!", "error");
                return;
            }
        }

        if (mode === "ADDRESS") {
            wsMiner.startAddressMining({ prefix });
        } else {
            wsMiner.startPackageMining({
                prefix,
                modulesBase64,
                sender,
                gasBudget: baseGasBudget,
                gasPrice: 1000,
                gasObjectId,
                gasObjectVersion,
                gasObjectDigest,
            });
        }
    }, [
        isValidPrefix,
        mode,
        prefix,
        modulesBase64,
        sender,
        baseGasBudget,
        gasObjectId,
        gasObjectVersion,
        gasObjectDigest,
        wsMiner,
        showToast,
    ]);

    const stopMining = useCallback(() => {
        wsMiner.stopMining();
    }, [wsMiner]);

    const clearResults = useCallback(() => {
        setState((prev) => ({ ...prev, foundResults: [] }));
    }, []);

    // Compute progress
    const attempts = wsMiner.progress?.attempts || 0;
    const hashrate = wsMiner.progress?.hashrate || 0;
    const progress = Math.min((attempts / estimatedAttempts) * 100, 100);

    return (
        <div className="min-h-screen p-4 md:p-8 bg-[var(--light)]">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <Header />

            <div className="max-w-4xl mx-auto grid gap-6">
                {/* Connection Status */}
                <div className="brutal-card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span
                            className={`w-3 h-3 rounded-full ${
                                wsMiner.isConnected ? "bg-green-500" : "bg-red-500"
                            }`}
                        ></span>
                        <span className="font-bold">
                            {wsMiner.isConnected
                                ? "🔗 Connected to Local Server"
                                : "⚠️ Not Connected"}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {!wsMiner.isConnected ? (
                            <button
                                onClick={() => wsMiner.connect()}
                                className="brutal-btn bg-[var(--primary)] text-white text-sm py-1 px-3"
                            >
                                Connect
                            </button>
                        ) : (
                            <button
                                onClick={() => wsMiner.disconnect()}
                                className="brutal-btn bg-gray-200 text-black text-sm py-1 px-3"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>

                {wsMiner.error && (
                    <div className="brutal-card p-4 bg-red-50 border-red-500 text-red-700">
                        ❌ {wsMiner.error}
                    </div>
                )}

                {/* <ModeSwitcher mode={mode} isRunning={wsMiner.isRunning} setMode={setMode} /> */}

                <ConfigCard
                    mode={mode}
                    prefix={prefix}
                    setPrefix={setPrefix}
                    baseGasBudget={baseGasBudget}
                    setBaseGasBudget={setBaseGasBudget}
                    isRunning={wsMiner.isRunning}
                    difficulty={difficulty}
                    estimatedAttempts={estimatedAttempts}
                    isValidPrefix={isValidPrefix}
                    modulesBase64={modulesBase64}
                    setModulesBase64={setModulesBase64}
                    sender={sender}
                    setSender={setSender}
                    gasObjectId={gasObjectId}
                    setGasObjectId={setGasObjectId}
                    gasObjectVersion={gasObjectVersion}
                    setGasObjectVersion={setGasObjectVersion}
                    gasObjectDigest={gasObjectDigest}
                    setGasObjectDigest={setGasObjectDigest}
                />

                <MiningControl
                    mode={mode}
                    isRunning={wsMiner.isRunning}
                    isConfigValid={!!(isConfigValid && wsMiner.isConnected)}
                    startMining={startMining}
                    stopMining={stopMining}
                    hashrate={hashrate}
                    attempts={attempts}
                    progress={progress}
                />

                <ResultsList
                    mode={mode}
                    results={state.foundResults}
                    clearResults={clearResults}
                    sender={sender}
                />

                <Footer mode={mode} />
            </div>
        </div>
    );
}

export default App;
