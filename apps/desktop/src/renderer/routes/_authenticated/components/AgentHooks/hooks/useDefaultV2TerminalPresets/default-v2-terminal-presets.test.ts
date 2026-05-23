import { describe, expect, it } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { createDefaultV2TerminalPresetRows } from "./default-v2-terminal-presets";

const createdAt = new Date("2026-05-14T12:00:00.000Z");

function createAgent(
	overrides: Partial<HostAgentConfig> & Pick<HostAgentConfig, "presetId">,
): HostAgentConfig {
	const { presetId, ...rest } = overrides;
	return {
		id: `${presetId}-id`,
		presetId,
		label: presetId,
		command: presetId,
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		order: 0,
		...rest,
	};
}

describe("createDefaultV2TerminalPresetRows", () => {
	it("creates linked default presets for an empty v2 preset list", () => {
		let id = 0;
		const rows = createDefaultV2TerminalPresetRows({
			agents: [
				createAgent({
					id: "claude-config",
					presetId: "claude",
					label: "Claude",
					command: "claude",
					args: ["--dangerously-skip-permissions"],
					order: 0,
				}),
				createAgent({
					id: "codex-config",
					presetId: "codex",
					label: "Codex",
					command: "codex",
					args: ["--dangerously-bypass-approvals-and-sandbox"],
					order: 1,
				}),
				createAgent({
					id: "opencode-config",
					presetId: "opencode",
					label: "OpenCode",
					command: "opencode",
					order: 2,
				}),
				createAgent({
					id: "copilot-config",
					presetId: "copilot",
					label: "Copilot",
					command: "copilot",
					args: ["--allow-tool=write"],
					order: 3,
				}),
				createAgent({ presetId: "amp", order: 4 }),
			],
			existingPresets: [],
			createId: () =>
				`00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
			createdAt,
		});

		expect(rows.map((row) => row.agentId)).toEqual([
			"claude-config",
			"codex-config",
			"opencode-config",
			"copilot-config",
		]);
		expect(rows.map((row) => row.name)).toEqual([
			"Claude",
			"Codex",
			"OpenCode",
			"Copilot",
		]);
		expect(rows.map((row) => row.tabOrder)).toEqual([0, 1, 2, 3]);
		expect(rows[0]?.commands).toEqual([
			"claude --dangerously-skip-permissions",
		]);
		expect(rows[1]?.commands).toEqual([
			"codex --dangerously-bypass-approvals-and-sandbox",
		]);
		expect(rows[2]?.commands).toEqual(["opencode"]);
		expect(rows[3]?.commands).toEqual(["copilot --allow-tool\\=write"]);
	});

	it("does not seed when v2 presets already exist", () => {
		const existingPreset = {
			id: "11111111-1111-4111-8111-111111111111",
			name: "Custom",
			cwd: "",
			commands: ["custom-agent"],
			projectIds: null,
			executionMode: "new-tab",
			tabOrder: 0,
			createdAt,
		} satisfies V2TerminalPresetRow;

		expect(
			createDefaultV2TerminalPresetRows({
				agents: [createAgent({ presetId: "claude" })],
				existingPresets: [existingPreset],
				createId: () => "22222222-2222-4222-8222-222222222222",
				createdAt,
			}),
		).toEqual([]);
	});

	it("skips missing agents and agents with empty commands", () => {
		const rows = createDefaultV2TerminalPresetRows({
			agents: [
				createAgent({ presetId: "claude", command: "   " }),
				createAgent({ presetId: "amp" }),
			],
			existingPresets: [],
			createId: () => "33333333-3333-4333-8333-333333333333",
			createdAt,
		});

		expect(rows).toEqual([]);
	});
});
