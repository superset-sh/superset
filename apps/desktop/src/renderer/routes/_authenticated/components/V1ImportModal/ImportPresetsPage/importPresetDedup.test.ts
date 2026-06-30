import { describe, expect, it } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	buildAgentConfigIdByPresetId,
	buildImportedPresetIndex,
	resolvePresetImport,
} from "./importPresetDedup";

const createdAt = new Date("2026-05-14T12:00:00.000Z");

function agent(id: string, presetId: string, label: string): HostAgentConfig {
	return {
		id,
		presetId,
		label,
		command: presetId,
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		order: 0,
	};
}

function v2Preset(
	overrides: Partial<V2TerminalPresetRow> & Pick<V2TerminalPresetRow, "name">,
): V2TerminalPresetRow {
	return {
		id: crypto.randomUUID(),
		cwd: "",
		commands: [],
		projectIds: null,
		executionMode: "new-tab",
		tabOrder: 0,
		createdAt,
		...overrides,
	};
}

describe("resolvePresetImport", () => {
	it("dedupes a builtin preset against a freshly-linked v2 preset", () => {
		const agents = [agent("claude-config", "claude", "Claude")];
		const index = buildImportedPresetIndex([
			v2Preset({ name: "Claude", agentId: "claude-config" }),
		]);

		const result = resolvePresetImport({
			presetName: "claude",
			agentConfigIdByPresetId: buildAgentConfigIdByPresetId(agents),
			index,
		});

		expect(result.alreadyImported).toBe(true);
	});

	// Reproduces issue #5132: after an upgrade the host-service re-seeds its
	// agent table with fresh random UUIDs, so the agent config id drifts
	// ("claude-OLD" -> "claude-NEW"). The already-imported v2 Claude preset
	// still references the OLD id. The dedup keyed only on the volatile agent
	// id no longer recognises it, so the wizard offers Claude for import again
	// and the user ends up with a duplicate — exactly the "re-import after
	// every upgrade" symptom in the report.
	it("dedupes a builtin preset whose linked agent id drifted across an upgrade", () => {
		const agents = [agent("claude-NEW", "claude", "Claude")];
		const index = buildImportedPresetIndex([
			v2Preset({ name: "Claude", agentId: "claude-OLD" }),
		]);

		const result = resolvePresetImport({
			presetName: "claude",
			agentConfigIdByPresetId: buildAgentConfigIdByPresetId(agents),
			index,
		});

		expect(result.alreadyImported).toBe(true);
	});

	it("dedupes a custom preset by name", () => {
		const index = buildImportedPresetIndex([v2Preset({ name: "My Deploy" })]);

		const result = resolvePresetImport({
			presetName: "My Deploy",
			agentConfigIdByPresetId: new Map(),
			index,
		});

		expect(result.alreadyImported).toBe(true);
	});

	it("offers a not-yet-imported builtin preset", () => {
		const agents = [agent("codex-config", "codex", "Codex")];
		const index = buildImportedPresetIndex([]);

		const result = resolvePresetImport({
			presetName: "codex",
			agentConfigIdByPresetId: buildAgentConfigIdByPresetId(agents),
			index,
		});

		expect(result.alreadyImported).toBe(false);
		expect(result.v2Name).toBe("Codex");
		expect(result.linkedAgentId).toBe("codex-config");
	});
});
