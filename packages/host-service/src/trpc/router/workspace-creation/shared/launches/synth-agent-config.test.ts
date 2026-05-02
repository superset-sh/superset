import { describe, expect, it } from "bun:test";
import {
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
} from "@superset/shared/agent-prompt-template";
import { synthAgentConfig } from "./synth-agent-config";

describe("synthAgentConfig", () => {
	it("synthesizes a TerminalResolvedAgentConfig with shared template defaults", () => {
		const config = synthAgentConfig({
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
		});

		expect(config.id).toBe("claude");
		expect(config.kind).toBe("terminal");
		expect(config.enabled).toBe(true);
		expect(config.taskPromptTemplate).toBe(DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE);
		expect(config.contextPromptTemplateSystem).toBe(
			DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
		);
		expect(config.contextPromptTemplateUser).toBe(
			DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
		);
	});

	it("carries through transport for stdin agents", () => {
		const config = synthAgentConfig({
			presetId: "mastracode",
			label: "Mastracode",
			command: "mastracode",
			promptTransport: "stdin",
		});
		expect(config.promptTransport).toBe("stdin");
	});

	it("carries through label and command verbatim", () => {
		const config = synthAgentConfig({
			presetId: "codex",
			label: "Codex",
			command: "codex --sandbox workspace-write",
			promptTransport: "argv",
		});
		expect(config.label).toBe("Codex");
		expect(config.command).toBe("codex --sandbox workspace-write");
	});
});
