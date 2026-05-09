import { describe, expect, it } from "bun:test";
import { applyLegacyPermissionsOverrides } from "@superset/shared/agent-permissions-migration";
import { buildLegacyHostAgentMirrorPlan } from "./v2-host-agent-mirror";

describe("buildLegacyHostAgentMirrorPlan", () => {
	it("returns an empty plan for an envelope with no overrides", () => {
		expect(buildLegacyHostAgentMirrorPlan({ version: 1, presets: [] })).toEqual(
			[],
		);
	});

	it("translates a claude `--dangerously-skip-permissions` v1 override into split form", () => {
		const envelope = applyLegacyPermissionsOverrides({
			version: 1,
			presets: [],
		});
		const plan = buildLegacyHostAgentMirrorPlan(envelope);

		const claude = plan.find((entry) => entry.presetId === "claude");
		expect(claude).toBeDefined();
		expect(claude?.command).toBe("claude");
		expect(claude?.args).toEqual(["--dangerously-skip-permissions"]);
	});

	it("includes codex / gemini / copilot when their override commands are set", () => {
		const envelope = applyLegacyPermissionsOverrides({
			version: 1,
			presets: [],
		});
		const plan = buildLegacyHostAgentMirrorPlan(envelope);
		const ids = plan.map((entry) => entry.presetId).sort();
		expect(ids).toContain("claude");
		expect(ids).toContain("codex");
		expect(ids).toContain("gemini");
		expect(ids).toContain("copilot");
	});

	it("preserves user-customized v1 overrides over legacy defaults", () => {
		const envelope = applyLegacyPermissionsOverrides({
			version: 1,
			presets: [{ id: "claude", command: "claude --my-custom-flag" }],
		});
		const plan = buildLegacyHostAgentMirrorPlan(envelope);
		const claude = plan.find((entry) => entry.presetId === "claude");
		expect(claude?.command).toBe("claude");
		expect(claude?.args).toEqual(["--my-custom-flag"]);
	});

	it("skips agents whose override has no command field", () => {
		const plan = buildLegacyHostAgentMirrorPlan({
			version: 1,
			presets: [{ id: "cursor-agent", promptCommandSuffix: "--yolo" }],
		});
		expect(
			plan.find((entry) => entry.presetId === "cursor-agent"),
		).toBeUndefined();
	});

	it("ignores overrides for non-builtin agent IDs", () => {
		const plan = buildLegacyHostAgentMirrorPlan({
			version: 1,
			presets: [{ id: "custom:abc-123", command: "my-custom" }],
		});
		expect(plan).toEqual([]);
	});
});
