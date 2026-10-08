import { useMutationState } from "@tanstack/react-query";
import { getMutationKey } from "@trpc/react-query";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** Ids of cloud workspaces whose archive has not settled yet. */
export function useArchivingCloudWorkspaceIds(): string[] {
	return useMutationState({
		filters: {
			mutationKey: getMutationKey(cloudTrpc.cloudWorkspace.delete),
			status: "pending",
		},
		select: (mutation) => (mutation.state.variables as { id: string }).id,
	});
}
