import { describe, expect, test } from "bun:test";
import { BUILTIN_TERMINAL_AGENT_COMMANDS } from "./builtin-terminal-agents";

describe("issue #4285: out-of-the-box defaults must produce a working agent", () => {
	test("claude default launches in auto mode", () => {
		const [command] = BUILTIN_TERMINAL_AGENT_COMMANDS.claude;
		// Per the issue: users expect Claude's default to be "auto mode" so
		// the agent can run without per-action permission prompts. The two
		// flags that disable prompting are `--dangerously-skip-permissions`
		// and `--permission-mode bypassPermissions`. `acceptEdits` only
		// auto-accepts file edits — it still prompts before shell commands,
		// which the issue reports as broken-on-first-run behavior.
		const enablesAutoMode =
			command.includes("--dangerously-skip-permissions") ||
			command.includes("--permission-mode bypassPermissions");
		expect(enablesAutoMode).toBe(true);
	});

	test("codex default does not combine workspace-write sandbox with `--ask-for-approval never`", () => {
		const [command] = BUILTIN_TERMINAL_AGENT_COMMANDS.codex;
		// Per the issue: this exact pairing produces "sandbox doesn't allow
		// me to run terminal command" errors. The workspace-write sandbox
		// blocks shell operations needing network or out-of-workspace access,
		// and `--ask-for-approval never` removes the agent's ability to
		// escalate — so codex silently refuses instead of asking the user.
		// Working alternatives: `--full-auto` (workspace-write + on-failure),
		// or `--dangerously-bypass-approvals-and-sandbox` for full auto mode.
		const isBrokenCombination =
			command.includes("--sandbox workspace-write") &&
			command.includes("--ask-for-approval never");
		expect(isBrokenCombination).toBe(false);
	});
});
