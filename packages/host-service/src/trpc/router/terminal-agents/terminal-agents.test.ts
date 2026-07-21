import { describe, expect, it } from "bun:test";
import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { encodeAgentPrompt } from "./terminal-agents";

describe("encodeAgentPrompt", () => {
	it("sends multiline input as one bracketed paste and one submit key", () => {
		expect(encodeAgentPrompt("first\nsecond 🎉")).toBe(
			"\x1b[200~first\nsecond 🎉\x1b[201~\r",
		);
	});

	it("composes with terminal control-character sanitization", () => {
		const prompt = sanitizePromptForPty("first\x1b[31m\n\tsecond\x07");
		expect(encodeAgentPrompt(prompt)).toBe(
			"\x1b[200~first\n    second\x1b[201~\r",
		);
	});
});
