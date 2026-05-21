import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateProjectQueries } from "./invalidateProjectQueries";

/**
 * Mutation hook for opening a new project
 * Creates a Project record if it doesn't exist
 */
export function useOpenNew(
	options?: Parameters<typeof electronTrpc.projects.openNew.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.openNew.useMutation({
		...options,
		onSuccess: async (...args) => {
			await invalidateProjectQueries(utils);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
