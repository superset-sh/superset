import { useEffect, useRef } from "react";
import type { NewWorkspaceDraft } from "renderer/stores/new-workspace-draft";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";

interface Options {
	projectId: string | null;
	hostId: string | null;
	updateDraft: (
		patch: Pick<NewWorkspaceDraft, "baseBranch" | "baseBranchSource">,
	) => void;
}

/**
 * Sets the draft's base branch to the user's last pick for the selected
 * project, on mount and on every project or host change. The draft store is
 * global and entry points select the project before this screen mounts, so a
 * base left over from another project would otherwise ride into the create.
 */
export function useBaseBranchReset({
	projectId,
	hostId,
	updateDraft,
}: Options) {
	const persistedDefault = useV2WorkspaceCreateDefaultsStore((state) =>
		projectId ? (state.baseBranchesByProjectId[projectId] ?? null) : null,
	);
	const seededForRef = useRef<{
		projectId: string | null;
		hostId: string | null;
	} | null>(null);
	useEffect(() => {
		const seededFor = seededForRef.current;
		if (seededFor?.projectId === projectId && seededFor.hostId === hostId) {
			return;
		}
		seededForRef.current = { projectId, hostId };
		updateDraft({
			baseBranch: persistedDefault?.branchName ?? null,
			baseBranchSource: persistedDefault?.source ?? null,
		});
	}, [projectId, hostId, persistedDefault, updateDraft]);
}
