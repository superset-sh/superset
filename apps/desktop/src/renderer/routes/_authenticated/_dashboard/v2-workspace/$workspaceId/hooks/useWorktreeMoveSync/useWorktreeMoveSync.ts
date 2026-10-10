import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { rebaseDocuments } from "../../state/fileDocumentStore";
import {
	rebaseWorktreePath,
	rebaseWorktreePaths,
} from "./utils/rebaseWorktreePaths";

export function useWorktreeMoveSync(workspaceId: string): void {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const utils = workspaceTrpc.useUtils();
	const collections = useCollections();
	const { data } = workspaceTrpc.workspace.get.useQuery({ id: workspaceId });
	const worktreePath = data?.worktreePath;
	const aliasesKey = (data?.worktreeAliases ?? []).join("\0");

	useEffect(() => {
		if (!hostUrl) return;
		return getHostEventBus(hostUrl).on(
			"workspace:changed",
			workspaceId,
			(_id, event) => {
				const to = event.workspace?.worktreePath;
				if (event.eventType !== "updated" || !to) return;
				// Set the new root before the re-rooted watcher's first events land.
				utils.workspace.get.setData({ id: workspaceId }, (current) =>
					current && current.worktreePath !== to
						? {
								...current,
								worktreePath: to,
								worktreeAliases: [
									...(current.worktreeAliases ?? []),
									current.worktreePath,
								],
							}
						: current,
				);
				void utils.workspace.get.invalidate({ id: workspaceId });
			},
		);
	}, [hostUrl, workspaceId, utils]);

	useEffect(() => {
		if (!worktreePath || !aliasesKey) return;
		for (const from of aliasesKey.split("\0")) {
			const rebase = (path: string) =>
				rebaseWorktreePath(path, from, worktreePath);
			rebaseDocuments(workspaceId, rebase);
			const row = collections.v2WorkspaceLocalState.get(workspaceId);
			if (
				row &&
				rebaseWorktreePaths(structuredClone(row), from, worktreePath)
			) {
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					rebaseWorktreePaths(draft, from, worktreePath);
				});
			}
		}
	}, [workspaceId, worktreePath, aliasesKey, collections]);
}
