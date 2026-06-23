import { describe, expect, it } from "bun:test";
import { normalizeTerminalCommand } from "renderer/lib/terminal/launch-command";
import {
	type AgentPromptFileContext,
	formatAgentPromptWithFileContext,
} from "./useSendToTerminalAgent";

const fileContext = (
	overrides?: Partial<AgentPromptFileContext>,
): AgentPromptFileContext => ({
	path: "src/a.ts",
	startLine: 40,
	endLine: 60,
	...overrides,
});

describe("formatAgentPromptWithFileContext (selection carrier)", () => {
	it("renders a multi-line selection as 'In <path>:L<a>-L<b>: <instruction>'", () => {
		const result = formatAgentPromptWithFileContext({
			comment: "refactor this",
			file: fileContext(),
		});

		expect(result).toBe("In src/a.ts:L40-L60: refactor this");
	});

	it("collapses a single-line selection range to 'L<a>' (not 'L<a>-L<a>')", () => {
		const result = formatAgentPromptWithFileContext({
			comment: "explain",
			file: fileContext({ startLine: 12, endLine: 12 }),
		});

		expect(result).toBe("In src/a.ts:L12: explain");
	});

	it("omits the diff-side suffix when no `side` is supplied (file-viewer case)", () => {
		const result = formatAgentPromptWithFileContext({
			comment: "look",
			file: fileContext({ startLine: 5, endLine: 9 }),
		});

		expect(result).not.toContain("(deleted lines)");
		expect(result).not.toContain("(across deletions and additions)");
		expect(result).toBe("In src/a.ts:L5-L9: look");
	});

	it("embeds a fenced snippet AND the file anchor when the comment carries the captured lines", () => {
		const snippet = "const x = 1;\nconst y = 2;";
		const comment = `Here is the selected code:\n\n\`\`\`\n${snippet}\n\`\`\``;

		const result = formatAgentPromptWithFileContext({
			comment,
			file: fileContext({ startLine: 1, endLine: 2 }),
		});

		expect(result).toContain("In src/a.ts:L1-L2:");
		expect(result).toContain("```");
		expect(result).toContain(snippet);
	});
});

describe("adapter divergence parity (edge case #5)", () => {
	// The terminal surface appends a trailing newline (normalizeTerminalCommand);
	// the chat surface trims both ends (chat-adapter toLaunchConfig does
	// initialPrompt?.trim()). After normalizing leading/trailing whitespace the
	// two carry the same context. This pins the terminal half of the invariant
	// against the documented chat-side trim (chat half lands with PR2).
	it("the terminal-serialized prompt trim-normalizes back to the formatted text", () => {
		const formatted = formatAgentPromptWithFileContext({
			comment: "Here is the selected code:",
			file: fileContext({ startLine: 3, endLine: 7 }),
		});

		const terminalSerialized = normalizeTerminalCommand(formatted);
		const chatSerialized = formatted.trim();

		expect(terminalSerialized).toBe(`${formatted}\n`);
		expect(terminalSerialized.trim()).toBe(chatSerialized);
	});
});
