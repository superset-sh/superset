import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { clearSandboxAccess } from "@/lib/sandbox-access";
import { apiClient } from "@/lib/trpc/client";

/**
 * Rename and delete for cloud workspaces go to the API, not the sandbox: the
 * cloud row owns the name (the sandbox's copy is scratch), and deleting
 * through the sandbox would remove the row inside it and leave the sandbox
 * running — and billing — with the cloud row still listing it.
 */
export function useCloudWorkspaceActions() {
	const queryClient = useQueryClient();

	const invalidate = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: ["cloud", "cloudWorkspace", "list"],
			}),
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
			await apiClient.cloudWorkspace.delete.mutate({ id });
			clearSandboxAccess(id);
			await invalidate();
		},
		[invalidate],
	);

	return { rename, remove };
}
