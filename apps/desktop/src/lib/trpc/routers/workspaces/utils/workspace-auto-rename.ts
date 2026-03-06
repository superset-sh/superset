interface WorkspaceAutoRenameState {
	branch: string;
	name: string;
	isUnnamed: boolean | null;
	deletingAt?: number | null;
}

interface ResolveWorkspaceAutoRenameParams {
	workspace: WorkspaceAutoRenameState | null;
	generatedName: string | null;
}

type WorkspaceAutoRenameDecision =
	| {
			kind: "rename";
			name: string;
	  }
	| {
			kind: "skip";
			reason:
				| "missing-workspace"
				| "empty-generated-name"
				| "workspace-deleting"
				| "workspace-named"
				| "workspace-name-changed";
	  };

export function getWorkspaceAutoRenameDecision({
	workspace,
	generatedName,
}: ResolveWorkspaceAutoRenameParams): WorkspaceAutoRenameDecision {
	const cleanedGeneratedName = generatedName?.trim() ?? "";
	if (!workspace) {
		return { kind: "skip", reason: "missing-workspace" };
	}

	if (!cleanedGeneratedName) {
		return { kind: "skip", reason: "empty-generated-name" };
	}

	if (workspace.deletingAt != null) {
		return { kind: "skip", reason: "workspace-deleting" };
	}

	if (!workspace.isUnnamed) {
		return { kind: "skip", reason: "workspace-named" };
	}

	// Only replace the original branch placeholder. If the name has already
	// changed, avoid overwriting it with a late async rename.
	if (workspace.name !== workspace.branch) {
		return { kind: "skip", reason: "workspace-name-changed" };
	}

	return { kind: "rename", name: cleanedGeneratedName };
}

export function resolveWorkspaceAutoRename({
	workspace,
	generatedName,
}: ResolveWorkspaceAutoRenameParams): string | null {
	const decision = getWorkspaceAutoRenameDecision({ workspace, generatedName });
	return decision.kind === "rename" ? decision.name : null;
}
