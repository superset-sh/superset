import { describe, expect, test } from "bun:test";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { applyCliTerminalScriptEdit } from "./applyCliTerminalScriptEdit";

describe("applyCliTerminalScriptEdit", () => {
	test("overwrites CLI-editable fields and keeps app-owned ones", () => {
		const createdAt = new Date("2026-01-01T00:00:00Z");
		const draft: V2TerminalPresetRow = {
			id: "script-a",
			name: "Old",
			description: "old description",
			cwd: "apps/web",
			commands: ["bun run old"],
			projectIds: ["project-a"],
			pinnedToBar: true,
			useAsWorkspaceRun: true,
			applyOnWorkspaceCreated: true,
			executionMode: "split-pane",
			tabOrder: 4,
			createdAt,
			agentId: "agent-1",
		};

		applyCliTerminalScriptEdit(draft, {
			id: "script-a",
			name: "New",
			cwd: "",
			commands: ["bun run new", "bun run worker"],
			pinnedToBar: false,
			cliImportPending: true,
			cliTargetOrganizationId: "org-a",
		});

		expect(draft).toEqual({
			id: "script-a",
			name: "New",
			description: undefined,
			cwd: "",
			commands: ["bun run new", "bun run worker"],
			projectIds: null,
			pinnedToBar: false,
			useAsWorkspaceRun: undefined,
			applyOnWorkspaceCreated: true,
			executionMode: "new-tab",
			tabOrder: 4,
			createdAt,
			agentId: "agent-1",
		});
	});
});
