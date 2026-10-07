import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getArchivedCloudWorkspacesQueryKey } from "@/hooks/useArchivedCloudWorkspaces";
import {
	type CloudWorkspaceRow,
	getCloudWorkspacesQueryKey,
} from "@/hooks/useCloudWorkspaces";
import { useSession } from "@/lib/auth/client";
import { clearSandboxAccess } from "@/lib/sandbox-access";
import { apiClient } from "@/lib/trpc/client";
import { beginCloudMove, endCloudMove } from "./pendingCloudMoves";

const LIST_KEY = ["cloud", "cloudWorkspace", "list"];

/**
 * Rename, archive and unarchive for cloud workspaces go to the API, not the
 * sandbox: the cloud row owns the name (the sandbox's copy is scratch), and the
 * API is what stops the sandbox and later deletes it.
 */
export function useCloudWorkspaceActions() {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

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

	/** Moves the row between the active and archived lists before the API answers. */
	const move = useCallback(
		(id: string, to: "archived" | "active") => {
			const active = getCloudWorkspacesQueryKey(organizationId);
			const archived = getArchivedCloudWorkspacesQueryKey(organizationId);
			const [from, into] =
				to === "archived" ? [active, archived] : [archived, active];
			const row = queryClient
				.getQueryData<CloudWorkspaceRow[]>(from)
				?.find((candidate) => candidate.id === id);
			queryClient.setQueryData<CloudWorkspaceRow[]>(from, (rows) =>
				rows?.filter((candidate) => candidate.id !== id),
			);
			if (!row) return;
			const moved: CloudWorkspaceRow =
				to === "archived"
					? {
							...row,
							status: "archived",
							archivedAt: new Date(),
							sandboxUrl: null,
						}
					: {
							...row,
							status: "provisioning",
							archivedAt: null,
							sandboxUrl: null,
						};
			beginCloudMove(to, moved);
			queryClient.setQueryData<CloudWorkspaceRow[]>(into, (rows) => [
				moved,
				...(rows ?? []).filter((candidate) => candidate.id !== id),
			]);
		},
		[organizationId, queryClient],
	);

	const archive = useCallback(
		async (id: string) => {
			await queryClient.cancelQueries({ queryKey: LIST_KEY });
			move(id, "archived");
			try {
				await apiClient.cloudWorkspace.archive.mutate({ id });
				clearSandboxAccess(id);
			} finally {
				endCloudMove(id);
				await invalidate();
			}
		},
		[invalidate, move, queryClient],
	);

	const unarchive = useCallback(
		async (id: string) => {
			await queryClient.cancelQueries({ queryKey: LIST_KEY });
			move(id, "active");
			try {
				await apiClient.cloudWorkspace.unarchive.mutate({ id });
			} finally {
				endCloudMove(id);
				await invalidate();
			}
		},
		[invalidate, move, queryClient],
	);

	return { rename, archive, unarchive };
}
