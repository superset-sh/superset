import { describe, expect, test } from "bun:test";
import {
	createWorkspaceAutoRenameWarning,
	getWorkspaceAutoRenameWarningContent,
} from "./workspace-auto-rename-warning";

describe("workspace auto rename warning", () => {
	test("creates a missing-credentials warning message", () => {
		expect(createWorkspaceAutoRenameWarning("missing-credentials")).toEqual({
			reason: "missing-credentials",
			message:
				"Couldn't auto-name this workspace because no chat API key is configured.",
		});
	});

	test("returns actionable content for generation failures", () => {
		expect(getWorkspaceAutoRenameWarningContent("generation-failed")).toEqual({
			title: "Workspace auto-name failed",
			description:
				"Superset could not generate a workspace title. Common causes are an expired API key, missing model access, a provider error, or a network issue.",
			suggestedActions: [
				"Check your API key and provider access in Settings > API Keys.",
				"Retry later or rename the workspace manually from the sidebar.",
			],
			primaryActionLabel: "Open API Keys",
		});
	});
});
