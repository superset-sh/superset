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
			"codex --dangerously-bypass-approvals-and-sandbox -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
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

	it("uses pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi \"$(cat <<'SUPERSET_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
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
