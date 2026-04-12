import { useWorkerPool, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { type ReactNode, useEffect } from "react";
import { createPierreWorker } from "../../lib/pierreWorker";

interface PierreWorkerPoolProviderProps {
	children: ReactNode;
}

function WorkerPoolDebug() {
	const pool = useWorkerPool();
	useEffect(() => {
		if (!pool) {
			console.warn("[pierre] worker pool manager is undefined");
			return;
		}
		console.log("[pierre] initial stats", pool.getStats());
		const unsubscribe = pool.subscribeToStatChanges((stats) => {
			console.log("[pierre] stats", stats);
		});
		return unsubscribe;
	}, [pool]);
	return null;
}

export function PierreWorkerPoolProvider({
	children,
}: PierreWorkerPoolProviderProps) {
	return (
		<WorkerPoolContextProvider
			poolOptions={{ workerFactory: createPierreWorker, poolSize: 4 }}
			highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
		>
			<WorkerPoolDebug />
			{children}
		</WorkerPoolContextProvider>
	);
}
