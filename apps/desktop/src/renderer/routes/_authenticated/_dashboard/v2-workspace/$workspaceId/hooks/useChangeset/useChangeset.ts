import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";

export type DiffCategory = "against-base" | "staged" | "unstaged";

export interface ChangesetFile {
	path: string;
	oldPath?: string;
	status: string;
	additions: number;
	deletions: number;
	category: DiffCategory;
}

interface UseChangesetArgs {
	workspaceId: string;
	category: DiffCategory;
	enabled?: boolean;
}

export function useChangeset({
	workspaceId,
	category,
	enabled = true,
}: UseChangesetArgs) {
	const utils = workspaceTrpc.useUtils();

	const statusQuery = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId },
		{ enabled, staleTime: Number.POSITIVE_INFINITY },
	);

	useWorkspaceEvent(
		"git:changed",
		workspaceId,
		(payload) => {
			void utils.git.getStatus.invalidate({ workspaceId });
			if (payload.paths && payload.paths.length > 0) {
				for (const path of payload.paths) {
					void utils.git.getDiff.invalidate({ workspaceId, path });
				}
			} else {
				void utils.git.getDiff.invalidate({ workspaceId });
			}
		},
		enabled,
	);

	const files = useMemo<ChangesetFile[]>(() => {
		const status = statusQuery.data;
		if (!status) return [];
		const bucket =
			category === "against-base"
				? status.againstBase
				: category === "staged"
					? status.staged
					: status.unstaged;
		return bucket.map((file) => ({
			path: file.path,
			oldPath: file.oldPath,
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
			category,
		}));
	}, [statusQuery.data, category]);

	return {
		files,
		isLoading: statusQuery.isLoading,
		isError: statusQuery.isError,
		error: statusQuery.error,
	};
}
