import { describe, expect, it } from "bun:test";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { resolveV2PresetIconKey } from "./preset-icon-key";

function createAgent(
	overrides: Partial<HostAgentConfig> &
		Pick<HostAgentConfig, "id" | "presetId">,
): HostAgentConfig {
	const { id, presetId, ...rest } = overrides;
	return {
		id,
		presetId,
		iconId: null,
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

describe("resolveV2PresetIconKey", () => {
	it("resolves linked host-agent config ids", () => {
		expect(
			resolveV2PresetIconKey({ agentId: "claude-config" }, [
				createAgent({ id: "claude-config", presetId: "claude" }),
			]),
		).toBe("claude");
	});

	it("prefers linked host-agent icon overrides", () => {
		expect(
			resolveV2PresetIconKey({ agentId: "custom-config" }, [
				createAgent({
					id: "custom-config",
					presetId: "custom",
					iconId: "codex",
				}),
			]),
		).toBe("codex");
	});

	it("resolves linked host-agent uploaded image icons", () => {
		const dataUri = "data:image/png;base64,abc123";

		expect(
			resolveV2PresetIconKey({ agentId: "custom-config" }, [
				createAgent({
					id: "custom-config",
					presetId: "custom",
					iconId: dataUri,
				}),
			]),
		).toBe(dataUri);
	});

	it("keeps supporting legacy rows whose agentId is already a preset id", () => {
		expect(resolveV2PresetIconKey({ agentId: "codex" }, [])).toBe("codex");
	});

	it("does not apply icon overrides to legacy rows whose agentId is already a preset id", () => {
		expect(
			resolveV2PresetIconKey({ agentId: "codex" }, [
				createAgent({
					id: "custom-codex-config",
					presetId: "codex",
					iconId: "claude",
				}),
			]),
		).toBe("codex");
	});

	it("infers the icon from stored commands when the agent link is stale", () => {
		expect(
			resolveV2PresetIconKey(
				{
					agentId: "deleted-config-id",
					commands: ["opencode"],
				},
				[createAgent({ id: "opencode-config", presetId: "opencode" })],
			),
		).toBe("opencode");
	});

	it("infers the icon from command paths for unlinked presets", () => {
		expect(
			resolveV2PresetIconKey(
				{
					commands: ["/opt/homebrew/bin/cursor-agent"],
				},
				[],
			),
		).toBe("cursor-agent");
	});

	it("prefers matching agent icon overrides when inferring from commands", () => {
		expect(
			resolveV2PresetIconKey(
				{
					commands: ["custom-agent"],
				},
				[
					createAgent({
						id: "custom-config",
						presetId: "custom",
						iconId: "claude",
						command: "custom-agent",
					}),
				],
			),
		).toBe("claude");
	});

	it("falls back to a shared preset id when command matches have different icon overrides", () => {
		expect(
			resolveV2PresetIconKey(
				{
					commands: ["codex"],
				},
				[
					createAgent({
						id: "codex-config-a",
						presetId: "codex",
						iconId: "claude",
						command: "codex",
					}),
					createAgent({
						id: "codex-config-b",
						presetId: "codex",
						iconId: "opencode",
						command: "codex",
					}),
				],
			),
		).toBe("codex");
	});

	it("does not infer from editable preset names", () => {
		expect(
			resolveV2PresetIconKey(
				{
					commands: ["echo claude"],
				},
				[createAgent({ id: "claude-config", presetId: "claude" })],
			),
		).toBeUndefined();
	});

	it("does not infer an icon when commands point at multiple agents", () => {
		expect(
			resolveV2PresetIconKey(
				{
					commands: ["claude", "codex"],
				},
				[
					createAgent({ id: "claude-config", presetId: "claude" }),
					createAgent({ id: "codex-config", presetId: "codex" }),
				],
			),
		).toBeUndefined();
	});
});
