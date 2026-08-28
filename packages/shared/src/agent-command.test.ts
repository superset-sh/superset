import { describe, expect, it } from "bun:test";
import {
	AGENT_LABELS,
	AGENT_TYPES,
	buildAgentFileCommand,
	buildAgentPromptCommand,
} from "./agent-command";
import { getPresetById } from "./host-agent-presets";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith(
			"claude --dangerously-skip-permissions \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
	});

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toStartWith("amp <<'SUPERSET_PROMPT_amp1234'");
		expect(command).not.toContain("amp -x");
	});

	it("uses Amp interactive stdin mode for file launches", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task-demo.md",
			agent: "amp",
		});

		expect(command).toBe("amp < '.superset/task-demo.md'");
	});

	it("uses OMP interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "omp-1234",
			agent: "omp",
		});

		expect(command).toStartWith("omp \"$(cat <<'SUPERSET_PROMPT_omp1234'");
		expect(command).not.toContain("omp -p");
	});

	it("preserves legacy Pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi \"$(cat <<'SUPERSET_PROMPT_pi1234'");
	});
});

describe("vibe agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("vibe");
		expect(AGENT_LABELS.vibe).toBe("Mistral Vibe");
	});
});

describe("kimi agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("kimi");
		expect(AGENT_LABELS.kimi).toBe("Kimi Code");
	});

	it("runs prompt launches headlessly and resumes them in the TUI", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "kimi-1234",
			agent: "kimi",
		});

		expect(command).toStartWith("kimi -p \"$(cat <<'SUPERSET_PROMPT_kimi1234'");
		expect(command).toEndWith('\n)" ; kimi --auto --continue');
	});

	it("derives the host prompt flag from the distinct prompt command", () => {
		const preset = getPresetById("kimi");
		expect(preset?.command).toBe("kimi");
		expect(preset?.args).toEqual([]);
		expect(preset?.promptArgs).toEqual(["-p"]);
	});
});

describe("kiro agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("kiro");
		expect(AGENT_LABELS.kiro).toBe("Kiro");
	});

	it("seeds prompt launches into the interactive chat positionally", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "kiro-1234",
			agent: "kiro",
		});

		expect(command).toStartWith(
			"kiro-cli chat --trust-all-tools \"$(cat <<'SUPERSET_PROMPT_kiro1234'",
		);
		expect(command).toEndWith('\n)"');
	});

	it("derives host preset args and id-based resume from the base command", () => {
		const preset = getPresetById("kiro");
		expect(preset?.command).toBe("kiro-cli");
		expect(preset?.args).toEqual(["chat", "--trust-all-tools"]);
		expect(preset?.promptArgs).toEqual([]);
		expect(preset?.resumeArgs).toEqual(["--resume-id"]);
	});
});

describe("agy agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("agy");
		expect(AGENT_LABELS.agy).toBe("Antigravity");
	});

	it("seeds prompt launches into the interactive session via -i", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "agy-1234",
			agent: "agy",
		});

		expect(command).toStartWith(
			"agy --mode accept-edits -i \"$(cat <<'SUPERSET_PROMPT_agy1234'",
		);
		expect(command).toEndWith('\n)"');
	});

	it("derives host preset args and id-based resume from the base command", () => {
		const preset = getPresetById("agy");
		expect(preset?.command).toBe("agy");
		expect(preset?.args).toEqual(["--mode", "accept-edits"]);
		expect(preset?.promptArgs).toEqual(["-i"]);
		expect(preset?.resumeArgs).toEqual(["--conversation"]);
	});
});

describe("fx agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("fx");
		expect(AGENT_LABELS.fx).toBe("fx");
	});

	it("runs prompt launches through fx ask and resumes them interactively", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "fx-1234",
			agent: "fx",
		});

		expect(command).toStartWith(
			"fx ask --auto \"$(cat <<'SUPERSET_PROMPT_fx1234'",
		);
		expect(command).toEndWith('\n)" ; fx resume last');
	});

	it("derives host preset prompt and resume args from the base command", () => {
		const preset = getPresetById("fx");
		expect(preset?.command).toBe("fx");
		expect(preset?.args).toEqual([]);
		expect(preset?.promptArgs).toEqual(["ask", "--auto"]);
		expect(preset?.resumeArgs).toEqual(["resume"]);
	});
});

describe("hermes agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("hermes");
		expect(AGENT_LABELS.hermes).toBe("Hermes");
	});

	it("runs prompt launches as a one-shot query and continues them in the chat", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "hermes-1234",
			agent: "hermes",
		});

		expect(command).toStartWith(
			"hermes chat --yolo -q \"$(cat <<'SUPERSET_PROMPT_hermes1234'",
		);
		expect(command).toEndWith('\n)" ; hermes chat --yolo -c');
	});

	it("derives host preset prompt and resume args from the base command", () => {
		const preset = getPresetById("hermes");
		expect(preset?.command).toBe("hermes");
		expect(preset?.args).toEqual(["chat", "--yolo"]);
		expect(preset?.promptArgs).toEqual(["-q"]);
		expect(preset?.resumeArgs).toEqual(["-r"]);
	});
});

describe("grok agent registration", () => {
	it("is a registered terminal agent with the right label", () => {
		expect(AGENT_TYPES).toContain("grok");
		expect(AGENT_LABELS.grok).toBe("Grok");
	});

	it("seeds prompt launches into the interactive TUI positionally", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "grok-1234",
			agent: "grok",
		});

		expect(command).toStartWith(
			"grok --always-approve \"$(cat <<'SUPERSET_PROMPT_grok1234'",
		);
		expect(command).toEndWith('\n)"');
	});

	it("derives host preset args from the base command with no prompt flag", () => {
		const preset = getPresetById("grok");
		expect(preset?.command).toBe("grok");
		expect(preset?.args).toEqual(["--always-approve"]);
		expect(preset?.promptArgs).toEqual([]);
	});
});
