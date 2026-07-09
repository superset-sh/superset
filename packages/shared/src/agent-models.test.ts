import { describe, expect, it } from "bun:test";
import {
	AGENT_EFFORT_SUPPORT,
	AGENT_MODEL_SUPPORT,
	buildAgentEffortArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	getAgentEffortSupport,
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

	it("has a model flag, a model env, or (superset) neither", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			if (entry.presetId === "superset") {
				expect(entry.modelFlag).toBeNull();
			} else if (entry.modelEnv) {
				// env-based presets (Vibe) carry the model via an env var, no flag
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

	it("includes fable in claude's curated list", () => {
		expect(buildAgentModelArgs("claude", "fable")).toEqual([
			"--model",
			"fable",
		]);
	});

	it("includes fable for the other CLIs that support it", () => {
		expect(buildAgentModelArgs("copilot", "claude-fable-5")).toEqual([
			"--model",
			"claude-fable-5",
		]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-thinking-high"),
		).toEqual(["--model", "claude-fable-5-thinking-high"]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-thinking-xhigh"),
		).toEqual(["--model", "claude-fable-5-thinking-xhigh"]);
		expect(buildAgentModelArgs("opencode", "anthropic/claude-fable-5")).toEqual(
			["--model", "anthropic/claude-fable-5"],
		);
	});
});

describe("AGENT_EFFORT_SUPPORT", () => {
	it("only references builtin presets", () => {
		const validIds = new Set<string>(BUILTIN_TERMINAL_AGENT_TYPES);
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(validIds.has(entry.presetId)).toBe(true);
		}
	});

	it("lists at least one effort per entry", () => {
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(entry.efforts.length).toBeGreaterThan(0);
		}
	});
});

describe("getAgentEffortSupport", () => {
	it("returns the entry for a supported preset", () => {
		expect(getAgentEffortSupport("claude")?.effortFlag).toBe("--effort");
	});

	it("returns undefined for presets without effort support", () => {
		expect(getAgentEffortSupport("gemini")).toBeUndefined();
		expect(getAgentEffortSupport("superset")).toBeUndefined();
	});
});

describe("buildAgentEffortArgs", () => {
	it("builds flag + value tokens", () => {
		expect(buildAgentEffortArgs("claude", "high")).toEqual([
			"--effort",
			"high",
		]);
	});

	it("prefixes the value for codex config overrides", () => {
		expect(buildAgentEffortArgs("codex", "high")).toEqual([
			"-c",
			"model_reasoning_effort=high",
		]);
	});

	it("returns [] when no effort is set", () => {
		expect(buildAgentEffortArgs("claude", undefined)).toEqual([]);
		expect(buildAgentEffortArgs("claude", "")).toEqual([]);
	});

	it("returns [] for unsupported presets", () => {
		expect(buildAgentEffortArgs("gemini", "high")).toEqual([]);
	});

	it("returns [] for effort ids outside the preset's curated list", () => {
		expect(buildAgentEffortArgs("claude", "bogus")).toEqual([]);
		expect(buildAgentEffortArgs("copilot", "max")).toEqual([]);
	});
});

describe("buildAgentModelEnv (vibe)", () => {
	it("returns VIBE_ACTIVE_MODEL for a valid vibe model", () => {
		expect(buildAgentModelEnv("vibe", "mistral-medium-3.5")).toEqual({
			VIBE_ACTIVE_MODEL: "mistral-medium-3.5",
		});
	});
	it("returns {} for an unknown model id (degrade to Vibe default)", () => {
		expect(buildAgentModelEnv("vibe", "not-a-model")).toEqual({});
	});
	it("returns {} when no model is selected", () => {
		expect(buildAgentModelEnv("vibe", undefined)).toEqual({});
	});
	it("returns {} for a preset without modelEnv", () => {
		expect(buildAgentModelEnv("claude", "opus")).toEqual({});
	});
	it("keeps buildAgentModelArgs empty for vibe (no --model flag)", () => {
		expect(buildAgentModelArgs("vibe", "mistral-medium-3.5")).toEqual([]);
	});
	it("exposes a vibe model catalog", () => {
		expect(getAgentModelSupport("vibe")?.models.map((m) => m.id)).toEqual([
			"mistral-medium-3.5",
			"devstral-small",
		]);
	});
});
