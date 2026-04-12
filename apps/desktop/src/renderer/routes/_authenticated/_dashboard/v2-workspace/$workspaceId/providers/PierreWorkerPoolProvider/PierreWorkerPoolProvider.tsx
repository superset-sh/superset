import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { createPierreWorker } from "../../lib/pierreWorker";

interface PierreWorkerPoolProviderProps {
	children: ReactNode;
}

export function PierreWorkerPoolProvider({
	children,
}: PierreWorkerPoolProviderProps) {
	return (
		<WorkerPoolContextProvider
			poolOptions={{ workerFactory: createPierreWorker, poolSize: 4 }}
			highlighterOptions={{ preferredHighlighter: "shiki-wasm" }}
		>
			{children}
		</WorkerPoolContextProvider>
	);
}
