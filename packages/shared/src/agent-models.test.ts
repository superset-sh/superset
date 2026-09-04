import { describe, expect, it } from "bun:test";
import {
	AGENT_EFFORT_SUPPORT,
	AGENT_MODE_SUPPORT,
	AGENT_MODEL_SUPPORT,
	buildAgentEffortArgs,
	buildAgentModeArgs,
	buildAgentModelArgs,
	buildAgentModelEnv,
	getAgentEffortSupport,
	getAgentEfforts,
	getAgentModelSupport,
	getAgentModeSupport,
	isCuratedAgentModel,
	resolveAgentLaunchPresetId,
	SUPERSET_CHAT_MODELS,
} from "./agent-models";
import { BUILTIN_TERMINAL_AGENT_TYPES } from "./builtin-terminal-agents";

describe("AGENT_MODEL_SUPPORT", () => {
	it("only references builtin presets (or the superset chat agent)", () => {
		const validIds = new Set<string>([
			...BUILTIN_TERMINAL_AGENT_TYPES,
			"superset",
			"omp",
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
			} else if (entry.presetId === "polygraph") {
				// polygraph's dropdown picks the harness it launches, not a model
				expect(entry.modelFlag).toBe("--agent");
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

describe("SUPERSET_CHAT_MODELS", () => {
	it("includes opus 5, fable 5.1, GPT-6 Astra and the GPT-5.6 Codex models", () => {
		const ids = SUPERSET_CHAT_MODELS.map((model) => model.id);
		expect(ids).toContain("anthropic/claude-opus-5");
		expect(ids).toContain("anthropic/claude-fable-5-1");
		expect(ids).toContain("openai/gpt-6-astra");
		expect(ids).toContain("openai/gpt-5.6-sol");
		expect(ids).toContain("openai/gpt-5.6-terra");
		expect(ids).toContain("openai/gpt-5.6-luna");
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

	it("offers pinned claude releases alongside the latest-tracking aliases", () => {
		const ids = getAgentModelSupport("claude")?.models.map((m) => m.id) ?? [];
		// Aliases follow the CLI's newest model; teams standardising on one
		// release need an id that stays put.
		expect(ids).toContain("opus");
		expect(ids).toContain("claude-fable-5-1");
		expect(ids).toContain("claude-opus-4-8");
		expect(ids).toContain("claude-opus-4-7");
		expect(ids).toContain("claude-sonnet-4-6");
		expect(ids).toContain("claude-haiku-4-5");
	});

	it("labels claude's aliases and pinned releases as separate sections", () => {
		const models = getAgentModelSupport("claude")?.models ?? [];
		const groupOf = (id: string) =>
			models.find((model) => model.id === id)?.group;
		expect(groupOf("opus")).toBe("Latest");
		expect(groupOf("claude-opus-4-8")).toBe("Pinned releases");
		expect(groupOf("claude-fable-5-1")).toBe("Pinned releases");
		// The header carries the distinction, so labels stay bare.
		expect(models.find((model) => model.id === "opus")?.label).toBe("Opus");
	});

	it("dates codex's retiring models in the picker, not just in a comment", () => {
		const models = getAgentModelSupport("codex")?.models ?? [];
		const groupOf = (id: string) =>
			models.find((model) => model.id === id)?.group;
		expect(groupOf("gpt-5.6-sol")).toBe("Current");
		expect(groupOf("gpt-5.4")).toBe("Retiring 2026-08-31");
		expect(groupOf("gpt-5.3-codex")).toBe("Retiring 2026-08-31");
	});

	it("passes a pinned legacy claude model through to the CLI flag", () => {
		expect(buildAgentModelArgs("claude", "claude-opus-4-8")).toEqual([
			"--model",
			"claude-opus-4-8",
		]);
	});

	it("includes opus 5 in claude's curated list", () => {
		expect(buildAgentModelArgs("claude", "claude-opus-5")).toEqual([
			"--model",
			"claude-opus-5",
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
			buildAgentModelArgs(
				"cursor-agent",
				"claude-fable-5-thinking-high",
				"xhigh",
			),
		).toEqual(["--model", "claude-fable-5-thinking-xhigh"]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-1-thinking-high"),
		).toEqual(["--model", "claude-fable-5-1-thinking-high"]);
		expect(buildAgentModelArgs("opencode", "anthropic/claude-fable-5")).toEqual(
			["--model", "anthropic/claude-fable-5"],
		);
	});

	it("includes fable 5.1 as a pinned claude release and for the models.dev harnesses", () => {
		expect(buildAgentModelArgs("claude", "claude-fable-5-1")).toEqual([
			"--model",
			"claude-fable-5-1",
		]);
		for (const preset of ["opencode", "omp"]) {
			expect(buildAgentModelArgs(preset, "anthropic/claude-fable-5-1")).toEqual(
				["--model", "anthropic/claude-fable-5-1"],
			);
		}
	});

	it("includes every GPT-5.6 Codex model", () => {
		for (const model of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
			expect(buildAgentModelArgs("codex", model)).toEqual(["--model", model]);
		}
	});

	it("offers GPT-6 Astra in codex's current section", () => {
		expect(buildAgentModelArgs("codex", "gpt-6-astra")).toEqual([
			"--model",
			"gpt-6-astra",
		]);
		const models = getAgentModelSupport("codex")?.models ?? [];
		expect(models.find((model) => model.id === "gpt-6-astra")?.group).toBe(
			"Current",
		);
	});

	it("includes opus 5 and the GPT-5.6 models for the other CLIs", () => {
		for (const model of [
			"claude-opus-5-high",
			"gpt-5.6-terra-medium",
			"gpt-5.6-luna-medium",
		]) {
			expect(buildAgentModelArgs("cursor-agent", model)).toEqual([
				"--model",
				model,
			]);
		}
		for (const model of [
			"anthropic/claude-opus-5",
			"openai/gpt-5.6-sol",
			"openai/gpt-5.6-terra",
			"openai/gpt-5.6-luna",
		]) {
			expect(buildAgentModelArgs("opencode", model)).toEqual([
				"--model",
				model,
			]);
		}
	});

	it("builds polygraph harness args for every supported harness", () => {
		for (const harness of ["claude", "codex", "opencode"]) {
			expect(buildAgentModelArgs("polygraph", harness)).toEqual([
				"--agent",
				harness,
			]);
		}
	});

	it("omits the polygraph harness flag when unset or unknown", () => {
		expect(buildAgentModelArgs("polygraph", undefined)).toEqual([]);
		expect(buildAgentModelArgs("polygraph", "")).toEqual([]);
		expect(buildAgentModelArgs("polygraph", "gemini")).toEqual([]);
	});

	it("builds OMP model args for configured roles and exact models", () => {
		expect(buildAgentModelArgs("omp", "@plan")).toEqual(["--model", "@plan"]);
		expect(buildAgentModelArgs("omp", "openai-codex/gpt-5.6-sol")).toEqual([
			"--model",
			"openai-codex/gpt-5.6-sol",
		]);
	});
});

describe("AGENT_EFFORT_SUPPORT", () => {
	it("only references builtin presets", () => {
		const validIds = new Set<string>([...BUILTIN_TERMINAL_AGENT_TYPES, "omp"]);
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(validIds.has(entry.presetId)).toBe(true);
		}
	});

	it("lists at least one effort per entry", () => {
		for (const entry of AGENT_EFFORT_SUPPORT) {
			expect(entry.efforts.length).toBeGreaterThan(0);
		}
	});

	it("keys model variants by curated models and efforts", () => {
		for (const entry of AGENT_EFFORT_SUPPORT) {
			if (!entry.modelVariants) continue;
			const modelIds = new Set(
				getAgentModelSupport(entry.presetId)?.models.map((m) => m.id),
			);
			const effortIds = new Set(entry.efforts.map((e) => e.id));
			for (const [model, variants] of Object.entries(entry.modelVariants)) {
				expect(modelIds.has(model)).toBe(true);
				for (const effort of Object.keys(variants)) {
					expect(effortIds.has(effort)).toBe(true);
				}
			}
		}
	});
});

describe("AGENT_MODE_SUPPORT", () => {
	it("only references builtin presets", () => {
		const validIds = new Set<string>([...BUILTIN_TERMINAL_AGENT_TYPES, "omp"]);
		for (const entry of AGENT_MODE_SUPPORT) {
			expect(validIds.has(entry.presetId)).toBe(true);
		}
	});

	it("lists at least one mode per entry", () => {
		for (const entry of AGENT_MODE_SUPPORT) {
			expect(entry.modes.length).toBeGreaterThan(0);
		}
	});
});

describe("getAgentModeSupport", () => {
	it("returns OMP plan-mode support", () => {
		expect(getAgentModeSupport("omp")?.modes.map((mode) => mode.id)).toEqual([
			"plan",
		]);
	});

	it("returns undefined for presets without launch modes", () => {
		expect(getAgentModeSupport("claude")).toBeUndefined();
	});
});

describe("resolveAgentLaunchPresetId", () => {
	it("recognizes OMP without reclassifying legacy Pi", () => {
		expect(resolveAgentLaunchPresetId("pi", "omp")).toBe("omp");
		expect(
			resolveAgentLaunchPresetId("custom:omp", "/opt/homebrew/bin/omp"),
		).toBe("omp");
		expect(resolveAgentLaunchPresetId("pi", "C:\\Tools\\OMP.EXE")).toBe("omp");
		expect(resolveAgentLaunchPresetId("pi", "pi")).toBe("pi");
		expect(resolveAgentLaunchPresetId("custom", "")).toBe("custom");
	});

	it("recognizes OMP when the configured command carries arguments", () => {
		expect(resolveAgentLaunchPresetId("pi", "omp --foo")).toBe("omp");
		expect(resolveAgentLaunchPresetId("pi", "/usr/local/bin/omp --foo")).toBe(
			"omp",
		);
		expect(resolveAgentLaunchPresetId("pi", "OMP.EXE --foo")).toBe("omp");
		expect(resolveAgentLaunchPresetId("pi", "pi --foo")).toBe("pi");
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

	it("returns [] for cursor-agent, whose effort rides the model id", () => {
		expect(
			buildAgentEffortArgs("cursor-agent", "low", "claude-opus-5-high"),
		).toEqual([]);
	});

	it("drops an effort the selected model does not accept", () => {
		expect(buildAgentEffortArgs("codex", "ultra", "gpt-5.6-sol")).toEqual([
			"-c",
			"model_reasoning_effort=ultra",
		]);
		expect(buildAgentEffortArgs("codex", "ultra", "gpt-5.5")).toEqual([]);
	});
});

describe("getAgentEfforts", () => {
	it("offers codex's top efforts only alongside the models that take them", () => {
		expect(getAgentEfforts("codex", "gpt-5.6-sol").map((e) => e.id)).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
			"ultra",
		]);
		expect(getAgentEfforts("codex", "gpt-6-astra").map((e) => e.id)).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		expect(getAgentEfforts("codex", "gpt-5.6-luna").map((e) => e.id)).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		expect(getAgentEfforts("codex", "gpt-5.5").map((e) => e.id)).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
		]);
	});

	it("keeps the full list when the model is unset or uncurated", () => {
		// Both launch on the agent's own default model.
		expect(getAgentEfforts("codex").map((e) => e.id)).toContain("ultra");
		expect(getAgentEfforts("codex", "gpt-9").map((e) => e.id)).toContain(
			"ultra",
		);
	});

	it("returns [] for presets without effort support", () => {
		expect(getAgentEfforts("gemini")).toEqual([]);
	});

	it("offers cursor-agent efforts only for models with a ladder", () => {
		expect(
			getAgentEfforts("cursor-agent", "claude-opus-4-8-high").map((e) => e.id),
		).toEqual(["low", "medium", "high", "xhigh", "max"]);
		expect(
			getAgentEfforts("cursor-agent", "claude-opus-5-high").map((e) => e.id),
		).toEqual(["low", "medium", "high"]);
		expect(
			getAgentEfforts("cursor-agent", "gpt-5.6-sol-medium").map((e) => e.id),
		).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
		expect(
			getAgentEfforts("cursor-agent", "kimi-k3-max").map((e) => e.id),
		).toEqual(["low", "high", "max"]);
		expect(getAgentEfforts("cursor-agent", "auto")).toEqual([]);
		expect(getAgentEfforts("cursor-agent", "composer-2.5")).toEqual([]);
		expect(getAgentEfforts("cursor-agent")).toEqual([]);
		expect(getAgentEfforts("cursor-agent", "gpt-9")).toEqual([]);
	});
});

describe("buildAgentModelArgs with effort", () => {
	it("swaps in the cursor-agent sibling id for the effort", () => {
		expect(
			buildAgentModelArgs("cursor-agent", "claude-opus-4-8-high", "low"),
		).toEqual(["--model", "claude-opus-4-8-low"]);
		expect(
			buildAgentModelArgs("cursor-agent", "gpt-5.3-codex", "medium"),
		).toEqual(["--model", "gpt-5.3-codex"]);
		expect(
			buildAgentModelArgs("cursor-agent", "gpt-5.3-codex", "xhigh"),
		).toEqual(["--model", "gpt-5.3-codex-xhigh"]);
		expect(
			buildAgentModelArgs("cursor-agent", "gpt-5.6-luna-medium", "none"),
		).toEqual(["--model", "gpt-5.6-luna-none"]);
		expect(
			buildAgentModelArgs("cursor-agent", "gpt-5.5-medium", "xhigh"),
		).toEqual(["--model", "gpt-5.5-extra-high"]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-opus-4-7-xhigh", "low"),
		).toEqual(["--model", "claude-opus-4-7-low"]);
	});

	it("keeps the default level when the model has no such effort", () => {
		expect(
			buildAgentModelArgs("cursor-agent", "claude-opus-5-high", "max"),
		).toEqual(["--model", "claude-opus-5-high"]);
		expect(buildAgentModelArgs("cursor-agent", "auto", "high")).toEqual([
			"--model",
			"auto",
		]);
		expect(buildAgentModelArgs("cursor-agent", "auto")).toEqual([
			"--model",
			"auto",
		]);
	});

	it("still launches a sibling id saved before it was folded into its family", () => {
		expect(
			buildAgentModelArgs("cursor-agent", "claude-fable-5-thinking-xhigh"),
		).toEqual(["--model", "claude-fable-5-thinking-xhigh"]);
		expect(buildAgentModelArgs("cursor-agent", "claude-opus-4-8-low")).toEqual([
			"--model",
			"claude-opus-4-8-low",
		]);
		expect(
			buildAgentModelArgs("cursor-agent", "claude-opus-4-8-bogus"),
		).toEqual([]);
		expect(isCuratedAgentModel("cursor-agent", "gpt-5.5-extra-high")).toBe(
			true,
		);
		expect(isCuratedAgentModel("claude", "claude-opus-5")).toBe(true);
		expect(isCuratedAgentModel("claude", "opus-9")).toBe(false);
	});

	it("ignores effort for flag-based presets", () => {
		expect(buildAgentModelArgs("claude", "opus", "high")).toEqual([
			"--model",
			"opus",
		]);
	});
});

describe("buildAgentModeArgs", () => {
	it("starts OMP in plan-first mode", () => {
		expect(buildAgentModeArgs("omp", "plan")).toEqual(["--plan-yolo"]);
	});

	it("degrades unset and unsupported modes to the CLI default", () => {
		expect(buildAgentModeArgs("omp", undefined)).toEqual([]);
		expect(buildAgentModeArgs("omp", "bogus")).toEqual([]);
		expect(buildAgentModeArgs("pi", "plan")).toEqual([]);
		expect(buildAgentModeArgs("claude", "plan")).toEqual([]);
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
