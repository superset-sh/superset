import { describe, expect, it } from "bun:test";
import {
	AGENT_MODEL_SUPPORT,
	buildAgentModelArgs,
	getAgentModelSupport,
} from "./agent-models";
import { BUILTIN_TERMINAL_AGENT_TYPES } from "./builtin-terminal-agents";

describe("AGENT_MODEL_SUPPORT", () => {
	it("only references builtin presets (or the superset chat agent)", () => {
		const validIds = new Set<string>([
			...BUILTIN_TERMINAL_AGENT_TYPES,
			"superset",
		]);
		for (const entry of AGENT_MODEL_SUPPORT) {
			expect(validIds.has(entry.presetId)).toBe(true);
		}
	});

	it("has a CLI flag for every terminal preset and none for superset", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			if (entry.presetId === "superset") {
				expect(entry.modelFlag).toBeNull();
			} else {
				expect(entry.modelFlag).toBe("--model");
			}
		}
	});

	it("lists at least one model per entry", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			expect(entry.models.length).toBeGreaterThan(0);
		}
	});
});

describe("getAgentModelSupport", () => {
	it("returns the entry for a supported preset", () => {
		expect(getAgentModelSupport("claude")?.modelFlag).toBe("--model");
	});

	it("returns undefined for presets without model support", () => {
		expect(getAgentModelSupport("amp")).toBeUndefined();
		expect(getAgentModelSupport("nonexistent")).toBeUndefined();
	});
});

describe("buildAgentModelArgs", () => {
	it("builds flag + value tokens", () => {
		expect(buildAgentModelArgs("claude", "sonnet")).toEqual([
			"--model",
			"sonnet",
		]);
	});

	it("returns [] when no model is set", () => {
		expect(buildAgentModelArgs("claude", undefined)).toEqual([]);
		expect(buildAgentModelArgs("claude", "")).toEqual([]);
	});

	it("returns [] for unsupported presets", () => {
		expect(buildAgentModelArgs("amp", "sonnet")).toEqual([]);
	});

	it("returns [] for model ids outside the preset's curated list", () => {
		expect(buildAgentModelArgs("claude", "bad-model")).toEqual([]);
		expect(buildAgentModelArgs("codex", "sonnet")).toEqual([]);
	});

	it("returns [] for superset (model travels via chat metadata)", () => {
		expect(
			buildAgentModelArgs("superset", "anthropic/claude-opus-4-8"),
		).toEqual([]);
	});
});
