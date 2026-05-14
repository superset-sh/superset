import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import type { FileStatus } from "../../components/StatusIndicator";
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
	const utils = workspaceTrpc.useUtils();

	const needsStatus = ref.kind === "against-base" || ref.kind === "uncommitted";
	const statusQuery = workspaceTrpc.git.getStatus.useQuery(
		{
			workspaceId,
			baseBranch:
				ref.kind === "against-base" ? (ref.baseBranch ?? undefined) : undefined,
		},
		{ enabled: needsStatus, staleTime: Number.POSITIVE_INFINITY },
	);

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
		needsStatus,
	);

	const files = useMemo<ChangesetFile[]>(() => {
		if (ref.kind === "commit") {
			return (commitQuery.data?.files ?? []).map((file) => ({
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				source: {
					kind: "commit",
					commitHash: ref.commitHash,
					fromHash: ref.fromHash,
				},
			}));
		}

		const status = statusQuery.data;
		if (!status) return [];

		if (ref.kind === "uncommitted") {
			return [
				...status.staged.map<ChangesetFile>((file) => ({
					path: file.path,
					oldPath: file.oldPath,
					status: file.status as FileStatus,
					additions: file.additions,
					deletions: file.deletions,
					source: { kind: "staged" },
				})),
				...status.unstaged.map<ChangesetFile>((file) => ({
					path: file.path,
					oldPath: file.oldPath,
					status: file.status as FileStatus,
					additions: file.additions,
					deletions: file.deletions,
					source: { kind: "unstaged" },
				})),
			];
		}

		// against-base: merge committed + dirty, last-wins by path, each file
		// tagged with its actual source so downstream getDiff fetches the right
		// bucket (dirty files show their working-tree diff; purely committed
		// files show the base-branch diff).
		const seen = new Map<string, ChangesetFile>();
		for (const file of status.againstBase) {
			seen.set(file.path, {
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				source: { kind: "against-base", baseBranch: ref.baseBranch },
			});
		}
		for (const file of status.staged) {
			seen.set(file.path, {
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				source: { kind: "staged" },
			});
		}
		for (const file of status.unstaged) {
			seen.set(file.path, {
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				source: { kind: "unstaged" },
			});
		}
		return Array.from(seen.values());
	}, [ref, statusQuery.data, commitQuery.data?.files]);

	const activeQuery = needsStatus ? statusQuery : commitQuery;

	return {
		files,
		isLoading: activeQuery.isLoading,
		isError: activeQuery.isError,
		error: activeQuery.error,
	};
}
