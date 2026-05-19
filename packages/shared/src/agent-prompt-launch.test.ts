import { describe, expect, test } from "bun:test";
import {
	buildPromptCommandString,
	buildPromptFileCommandString,
} from "./agent-prompt-launch";

// Regression #4705: the generated launch command is written verbatim into the
// user's terminal pane, which runs whatever shell the user configured ($SHELL).
// fish does not support bash heredoc syntax (`<<'EOF'...EOF`), so emitting a
// bare heredoc breaks the launch with:
//   "fish: Expected a string, but found a redirection".
// The fix is to wrap every command that uses bash-only syntax (heredoc or
// `$(...)` command substitution) in `bash -c '...'` so the user's shell only
// sees a single, well-formed POSIX invocation.
describe("agent prompt launch — fish-shell compatibility (#4705)", () => {
	test("argv-transport prompt command is wrapped in bash -c", () => {
		const command = buildPromptCommandString({
			command: "claude --permission-mode acceptEdits",
			transport: "argv",
			prompt: "test",
			randomId: "f96e7282-9be6-4afa-a216-cd1117284013",
		});

		expect(command.startsWith("bash -c '")).toBe(true);
		expect(command.endsWith("'")).toBe(true);
		// The original prompt text must still be reachable inside the wrapper.
		expect(command).toContain("test");
	});

	test("stdin-transport prompt command is wrapped in bash -c", () => {
		const command = buildPromptCommandString({
			command: "amp",
			transport: "stdin",
			prompt: "hello",
			randomId: "amp-1234",
		});

		expect(command.startsWith("bash -c '")).toBe(true);
		expect(command.endsWith("'")).toBe(true);
		expect(command).toContain("hello");
	});

	test("argv-transport file command is wrapped in bash -c", () => {
		const command = buildPromptFileCommandString({
			command: "claude --permission-mode acceptEdits",
			transport: "argv",
			filePath: ".superset/task-demo.md",
		});

		expect(command.startsWith("bash -c '")).toBe(true);
		expect(command.endsWith("'")).toBe(true);
	});

	test("single quotes in the prompt survive the bash -c wrapping", () => {
		const command = buildPromptCommandString({
			command: "claude --permission-mode acceptEdits",
			transport: "argv",
			prompt: "it's a test",
			randomId: "abcd-efgh",
		});

		expect(command.startsWith("bash -c '")).toBe(true);
		expect(command.endsWith("'")).toBe(true);
		// Single quote in the prompt body is encoded with the POSIX
		// '\'' sequence — supported by bash, zsh, AND fish.
		expect(command).toContain("it'\\''s a test");
	});
});
