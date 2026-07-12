import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import type { FileStatus } from "../../components/StatusIndicator";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import { buildChangesetFiles } from "./buildChangesetFiles";
import type { ChangesetFile, DiffRef } from "./types";

interface UseChangesetArgs {
	workspaceId: string;
	ref: DiffRef;
}

interface UseChangesetResult {
	files: ChangesetFile[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
}

export function useChangeset({
	workspaceId,
	ref,
}: UseChangesetArgs): UseChangesetResult {
	const gitStatus = useWorkspaceGitStatus();
	const commitQuery = workspaceTrpc.git.getCommitFiles.useQuery(
		ref.kind === "commit"
			? {
					workspaceId,
					commitHash: ref.commitHash,
					fromHash: ref.fromHash,
				}
			: { workspaceId, commitHash: "" },
		{
			enabled: ref.kind === "commit",
			staleTime: Number.POSITIVE_INFINITY,
		},
	);

	const files = useMemo<ChangesetFile[]>(() => {
		if (ref.kind === "commit") {
			return (commitQuery.data?.files ?? []).map((file) => ({
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				isBinary: file.isBinary,
				source: {
					kind: "commit",
					commitHash: ref.commitHash,
					fromHash: ref.fromHash,
				},
			}));
		}

		const status = gitStatus.data;
		if (!status) return [];

		return buildChangesetFiles(status, ref);
	}, [ref, gitStatus.data, commitQuery.data?.files]);

	const activeQuery = ref.kind === "commit" ? commitQuery : gitStatus;

	return {
		files,
		isLoading: activeQuery.isLoading,
		isError: activeQuery.isError,
		error: activeQuery.error,
	};
}
