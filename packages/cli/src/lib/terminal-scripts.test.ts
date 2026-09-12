import { beforeEach, describe, expect, test } from "bun:test";
import { readSettingsRow } from "./settings";
import { writeSettings } from "./settings/local-settings";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "./settings/test-helpers";
import {
	createTerminalScript,
	deleteTerminalScript,
	findTerminalScriptByName,
	listTerminalScripts,
	toPublicTerminalScript,
	updateTerminalScript,
} from "./terminal-scripts";

const home = withTempSupersetHome("superset-cli-scripts-");

beforeEach(() => {
	createLocalSettingsDb(home.dir);
});

describe("createTerminalScript", () => {
	test("appends a legacy-compatible terminal preset", () => {
		const script = createTerminalScript({
			organizationId: "org-a",
			name: " Dev server ",
			commands: [" bun run dev ", " bun run worker "],
			projectIds: ["project-a", "project-a", "project-b"],
			executionMode: "split-pane",
		});

		expect(script).toEqual({
			id: script.id,
			name: "Dev server",
			description: undefined,
			cwd: "",
			commands: ["bun run dev", "bun run worker"],
			projectIds: ["project-a", "project-b"],
			pinnedToBar: true,
			useAsWorkspaceRun: undefined,
			executionMode: "split-pane",
			cliImportPending: true,
			cliTargetOrganizationId: "org-a",
		});
		expect(readSettingsRow()?.terminalPresets).toEqual([script]);
	});

	test("preserves existing terminal scripts", () => {
		writeSettings({
			terminalPresets: [
				{
					id: "existing",
					name: "Existing",
					cwd: "",
					commands: ["echo existing"],
				},
			],
		});

		createTerminalScript({
			organizationId: "org-a",
			name: "New",
			commands: ["echo new"],
			pinnedToBar: false,
		});

		expect(readSettingsRow()?.terminalPresets?.map(({ name }) => name)).toEqual(
			["Existing", "New"],
		);
		expect(readSettingsRow()?.terminalPresets?.[1]?.pinnedToBar).toBe(false);
	});
});

describe("updateTerminalScript", () => {
	test("patches only the given fields and re-flags the row for import", () => {
		writeSettings({
			terminalPresets: [
				{
					id: "existing",
					name: "Existing",
					description: "keep me",
					cwd: "apps/web",
					commands: ["echo existing"],
					projectIds: ["project-a"],
					pinnedToBar: false,
					executionMode: "split-pane",
				},
			],
		});

		const updated = updateTerminalScript({
			organizationId: "org-a",
			id: "existing",
			patch: { commands: [" gh pr view --web "], pinnedToBar: true },
		});

		expect(updated).toEqual({
			id: "existing",
			name: "Existing",
			description: "keep me",
			cwd: "apps/web",
			commands: ["gh pr view --web"],
			projectIds: ["project-a"],
			pinnedToBar: true,
			useAsWorkspaceRun: undefined,
			executionMode: "split-pane",
			cliImportPending: true,
			cliTargetOrganizationId: "org-a",
		});
		expect(readSettingsRow()?.terminalPresets).toEqual([updated]);
	});

	test("clears description, projects, and run flag when asked", () => {
		writeSettings({
			terminalPresets: [
				{
					id: "existing",
					name: "Existing",
					description: "old",
					cwd: "",
					commands: ["echo existing"],
					projectIds: ["project-a"],
					useAsWorkspaceRun: true,
				},
			],
		});

		const updated = updateTerminalScript({
			organizationId: "org-a",
			id: "existing",
			patch: { description: "", projectIds: null, useAsWorkspaceRun: false },
		});

		expect(updated.description).toBeUndefined();
		expect(updated.projectIds).toBeNull();
		expect(updated.useAsWorkspaceRun).toBeUndefined();
	});

	test("rejects unknown ids, empty values, and scripts being deleted", () => {
		writeSettings({
			terminalPresets: [
				{ id: "a", name: "A", cwd: "", commands: ["echo a"] },
				{
					id: "gone",
					name: "Gone",
					cwd: "",
					commands: ["echo gone"],
					cliDeletePending: true,
					cliTargetOrganizationId: "org-a",
				},
			],
		});
		const update = (id: string, patch: Record<string, unknown>) => () =>
			updateTerminalScript({ organizationId: "org-a", id, patch });

		expect(update("missing", { name: "x" })).toThrow(/not found/);
		expect(update("a", { name: "  " })).toThrow(/name cannot be empty/);
		expect(update("a", { commands: [""] })).toThrow(/commands cannot be empty/);
		expect(update("gone", { name: "x" })).toThrow(/scheduled for deletion/);
		expect(readSettingsRow()?.terminalPresets?.[0]?.name).toBe("A");
	});
});

describe("deleteTerminalScript", () => {
	test("tombstones a script even when its import is still pending", () => {
		const script = createTerminalScript({
			organizationId: "org-a",
			name: "Fresh",
			commands: ["echo fresh"],
		});

		const result = deleteTerminalScript({
			organizationId: "org-a",
			id: script.id,
		});

		expect(result.cliDeletePending).toBe(true);
		expect(result.cliImportPending).toBeUndefined();
		expect(readSettingsRow()?.terminalPresets).toEqual([result]);
	});

	test("leaves a tombstone for a script the desktop already imported", () => {
		writeSettings({
			terminalPresets: [
				{ id: "imported", name: "Imported", cwd: "", commands: ["echo"] },
			],
		});

		deleteTerminalScript({ organizationId: "org-a", id: "imported" });

		expect(readSettingsRow()?.terminalPresets).toEqual([
			{
				id: "imported",
				name: "Imported",
				cwd: "",
				commands: ["echo"],
				cliDeletePending: true,
				cliTargetOrganizationId: "org-a",
			},
		]);

		const again = deleteTerminalScript({
			organizationId: "org-a",
			id: "imported",
		});
		expect(again.cliDeletePending).toBe(true);
		expect(readSettingsRow()?.terminalPresets).toHaveLength(1);
	});

	test("rejects unknown ids", () => {
		expect(() =>
			deleteTerminalScript({ organizationId: "org-a", id: "missing" }),
		).toThrow(/not found/);
	});
});

describe("findTerminalScriptByName", () => {
	test("matches the trimmed name and ignores tombstones", () => {
		writeSettings({
			terminalPresets: [
				{ id: "a", name: "Open in GitHub", cwd: "", commands: ["echo"] },
				{
					id: "gone",
					name: "Open in GitHub",
					cwd: "",
					commands: ["echo"],
					cliDeletePending: true,
					cliTargetOrganizationId: "org-a",
				},
			],
		});

		expect(findTerminalScriptByName(" Open in GitHub ")?.id).toBe("a");
		expect(findTerminalScriptByName("Other")).toBeUndefined();
	});

	test("refuses to pick between duplicates", () => {
		writeSettings({
			terminalPresets: [
				{ id: "a", name: "Dup", cwd: "", commands: ["echo"] },
				{ id: "b", name: "Dup", cwd: "", commands: ["echo"] },
			],
		});

		expect(() => findTerminalScriptByName("Dup")).toThrow(
			/2 scripts are named Dup: a, b/,
		);
	});
});

describe("listTerminalScripts", () => {
	test("returns every stored row with a public status", () => {
		expect(listTerminalScripts()).toEqual([]);
		writeSettings({
			terminalPresets: [
				{ id: "a", name: "A", cwd: "", commands: ["echo a"] },
				{
					id: "b",
					name: "B",
					cwd: "",
					commands: ["echo b"],
					cliImportPending: true,
					cliTargetOrganizationId: "org-a",
				},
				{
					id: "c",
					name: "C",
					cwd: "",
					commands: ["echo c"],
					cliDeletePending: true,
					cliTargetOrganizationId: "org-a",
				},
			],
		});

		expect(listTerminalScripts().map(toPublicTerminalScript)).toEqual([
			{ id: "a", name: "A", cwd: "", commands: ["echo a"], status: "ready" },
			{
				id: "b",
				name: "B",
				cwd: "",
				commands: ["echo b"],
				status: "importing",
			},
			{ id: "c", name: "C", cwd: "", commands: ["echo c"], status: "deleting" },
		]);
	});
});
