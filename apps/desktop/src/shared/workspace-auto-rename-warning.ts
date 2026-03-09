export type WorkspaceAutoRenameWarningReason =
	| "missing-credentials"
	| "generation-failed";

export interface WorkspaceAutoRenameWarning {
	reason: WorkspaceAutoRenameWarningReason;
	message: string;
}

interface WorkspaceAutoRenameWarningContent {
	title: string;
	description: string;
	suggestedActions: string[];
	primaryActionLabel?: string;
}

const WARNING_MESSAGES: Record<WorkspaceAutoRenameWarningReason, string> = {
	"missing-credentials":
		"Couldn't auto-name this workspace because no chat API key is configured.",
	"generation-failed": "Couldn't auto-name this workspace.",
};

export function createWorkspaceAutoRenameWarning(
	reason: WorkspaceAutoRenameWarningReason,
): WorkspaceAutoRenameWarning {
	return {
		reason,
		message: WARNING_MESSAGES[reason],
	};
}

export function getWorkspaceAutoRenameWarningContent(
	reason: WorkspaceAutoRenameWarningReason,
): WorkspaceAutoRenameWarningContent {
	switch (reason) {
		case "missing-credentials":
			return {
				title: "Workspace kept its branch name",
				description:
					"Superset could not auto-name this workspace because no OpenAI or Anthropic API key is configured.",
				suggestedActions: [
					"Add an API key in Settings > API Keys.",
					"Rename the workspace manually from the sidebar if you want a custom title now.",
				],
				primaryActionLabel: "Open API Keys",
			};
		case "generation-failed":
			return {
				title: "Workspace auto-name failed",
				description:
					"Superset could not generate a workspace title. Common causes are an expired API key, missing model access, a provider error, or a network issue.",
				suggestedActions: [
					"Check your API key and provider access in Settings > API Keys.",
					"Retry later or rename the workspace manually from the sidebar.",
				],
				primaryActionLabel: "Open API Keys",
			};
	}
}
