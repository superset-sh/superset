import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { cacheResumedSuccessor } from "./cacheResumedSuccessor";

interface Successor {
	terminalId: string;
	label: string;
}

export async function resumeWithSuccessorRecovery(
	queryClient: QueryClient,
	queryKey: QueryKey,
	resume: () => Promise<Successor>,
	lookupSuccessor: () => Promise<Successor | null>,
): Promise<void> {
	let successor: Successor;
	try {
		successor = await resume();
	} catch (error) {
		if (!(error instanceof TRPCClientError) || error.shape != null) throw error;
		const saved = await lookupSuccessor().catch(() => null);
		if (!saved) throw error;
		successor = saved;
	}
	await cacheResumedSuccessor(queryClient, queryKey, successor);
}
