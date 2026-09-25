import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { clearSandboxAccess } from "@/lib/sandbox-access";
import { apiClient } from "@/lib/trpc/client";

const LIST_KEY = ["cloud", "cloudWorkspace", "list"];

/**
 * Rename and delete for cloud workspaces go to the API, not the sandbox: the
 * cloud row owns the name (the sandbox's copy is scratch), and deleting
 * through the sandbox would remove the row inside it and leave the sandbox
 * running — and billing — with the cloud row still listing it.
 */
export function useCloudWorkspaceActions() {
	const queryClient = useQueryClient();

	const invalidate = useCallback(
		() => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
		[queryClient],
	);

	const rename = useCallback(
		async (id: string, name: string) => {
			await apiClient.cloudWorkspace.rename.mutate({ id, name });
			await invalidate();
		},
		[invalidate],
	);

	const remove = useCallback(
		async (id: string) => {
			// The row goes when the user asks, not when the provider finishes
			// tearing the sandbox down; the invalidate below is what restores it
			// if the delete never landed.
			queryClient.setQueriesData<CloudWorkspaceRow[]>(
				{ queryKey: LIST_KEY },
				(rows) => rows?.filter((row) => row.id !== id),
			);
			try {
				await apiClient.cloudWorkspace.delete.mutate({ id });
				clearSandboxAccess(id);
			} finally {
				await invalidate();
			}
		},
		[invalidate, queryClient],
	);

	return { rename, remove };
}
