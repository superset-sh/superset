import type { DestroyWorkspacePreview } from "renderer/hooks/host-service/useDestroyWorkspace";

export function getWorkspaceMissingOnHostPreview(): DestroyWorkspacePreview {
	return {
		canDelete: true,
		reason: null,
		hasChanges: false,
		hasUnpushedCommits: false,
	};
}
