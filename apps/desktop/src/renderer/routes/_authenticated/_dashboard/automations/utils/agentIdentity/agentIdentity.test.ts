import { describe, expect, it } from "bun:test";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { matchAgentChoice, portableAgentValue } from "./agentIdentity";

const claude: AgentSelectAgent = {
	id: "11111111-1111-4111-8111-111111111111",
	label: "Claude Code",
	presetId: "claude",
};
const claudeYolo: AgentSelectAgent = {
	id: "22222222-2222-4222-8222-222222222222",
	label: "Claude YOLO",
	presetId: "claude",
};
const codex: AgentSelectAgent = {
	id: "33333333-3333-4333-8333-333333333333",
	label: "Codex",
	presetId: "codex",
};
const custom: AgentSelectAgent = {
	id: "44444444-4444-4444-8444-444444444444",
	label: "My Agent",
	presetId: "custom",
};
const superset: AgentSelectAgent = {
	id: "superset",
	label: "Superset",
	iconId: "superset",
};

describe("matchAgentChoice", () => {
	it("matches by instance id first", () => {
		expect(matchAgentChoice([claude, codex], codex.id)).toBe(codex);
	});

	it("falls back to preset slug", () => {
		expect(matchAgentChoice([claude, codex], "codex")).toBe(codex);
	});

	it("prefers the first (display-order) config among duplicate presets, like the host does", () => {
		expect(matchAgentChoice([claude, claudeYolo], "claude")).toBe(claude);
	});

	it("matches the superset chat agent by its literal id", () => {
		expect(matchAgentChoice([claude, superset], "superset")).toBe(superset);
	});

	it("returns undefined for a stale UUID from a re-seeded host", () => {
		expect(
			matchAgentChoice([claude, codex], "4525b6cf-8b54-43cb-89ab-d1533d708635"),
		).toBeUndefined();
	});

	it("returns undefined for empty values", () => {
		expect(matchAgentChoice([claude], "")).toBeUndefined();
		expect(matchAgentChoice([claude], null)).toBeUndefined();
	});
});

describe("portableAgentValue", () => {
	it("stores the preset slug when it names exactly one config", () => {
		expect(portableAgentValue([claude, codex, custom], claude)).toBe("claude");
	});

	it("keeps the instance id when two configs share the preset", () => {
		expect(portableAgentValue([claude, claudeYolo, codex], claudeYolo)).toBe(
			claudeYolo.id,
		);
		expect(portableAgentValue([claude, claudeYolo, codex], claude)).toBe(
			claude.id,
		);
	});

	it("keeps the instance id for custom agents", () => {
		expect(portableAgentValue([claude, custom], custom)).toBe(custom.id);
	});

	it("keeps the id for choices without a preset (superset chat)", () => {
		expect(portableAgentValue([claude, superset], superset)).toBe("superset");
	});
});
