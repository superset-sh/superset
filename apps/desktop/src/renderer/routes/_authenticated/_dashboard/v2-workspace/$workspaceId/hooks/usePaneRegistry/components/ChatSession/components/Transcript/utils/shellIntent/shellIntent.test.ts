import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import {
	effectiveToolKind,
	inferShellIntent,
	intentLocation,
	toolCallIntent,
	unwrapShellCommand,
} from "./shellIntent";

function execute(overrides: Partial<ToolCall>): ToolCall {
	return {
		id: "t1",
		kind: "tool_call",
		title: "Running a command",
		toolKind: "execute",
		toolName: "Bash",
		status: "completed",
		startedAtMs: 1,
		content: [],
		...overrides,
	};
}

describe("inferShellIntent", () => {
	test("reads: cat, head, tail and sed -n with its start line", () => {
		expect(inferShellIntent("cat package.json")).toEqual({
			verb: "read",
			path: "package.json",
		});
		expect(inferShellIntent("head -n 40 src/index.ts")).toEqual({
			verb: "read",
			path: "src/index.ts",
		});
		expect(inferShellIntent("tail -20 logs/dev.log")).toEqual({
			verb: "read",
			path: "logs/dev.log",
		});
		expect(inferShellIntent("sed -n '120,160p' src/app.ts")).toEqual({
			verb: "read",
			path: "src/app.ts",
			startLine: 120,
		});
	});

	test("searches: grep and rg carry the query and the scope, find its name", () => {
		expect(inferShellIntent("grep -rn 'rate_limit' packages/chat")).toEqual({
			verb: "search",
			query: "rate_limit",
			path: "packages/chat",
		});
		expect(inferShellIntent("rg -n --type ts useQueue src")).toEqual({
			verb: "search",
			query: "useQueue",
			path: "src",
		});
		expect(inferShellIntent("rg --files")).toEqual({
			verb: "search",
			query: "files",
		});
		expect(inferShellIntent("find . -name '*.test.ts' -maxdepth 3")).toEqual({
			verb: "search",
			query: "*.test.ts",
		});
		expect(inferShellIntent("fd -e ts useQueue packages")).toEqual({
			verb: "search",
			query: "useQueue",
			path: "packages",
		});
	});

	test("lists a directory, and a bare ls is nothing to say", () => {
		expect(inferShellIntent("ls -la src/components")).toEqual({
			verb: "list",
			path: "src/components",
		});
		expect(inferShellIntent("ls")).toBeNull();
	});

	test("a pipe or chain of readers reports the stage that mattered", () => {
		expect(inferShellIntent("cat a.ts | grep foo")).toEqual({
			verb: "search",
			query: "foo",
		});
		expect(inferShellIntent("cd src && cat index.ts | wc -l")).toEqual({
			verb: "read",
			path: "src/index.ts",
		});
		expect(
			inferShellIntent("cd apps/desktop && cd ../.. && ls packages/chat"),
		).toEqual({ verb: "list", path: "packages/chat" });
		expect(inferShellIntent("cd src; cat /etc/hosts")).toEqual({
			verb: "read",
			path: "/etc/hosts",
		});
		expect(inferShellIntent("cd src && echo x > out.txt")).toEqual({
			verb: "write",
			path: "src/out.txt",
		});
	});

	test("a redirect writes or appends to the target", () => {
		expect(inferShellIntent("echo hi > notes.txt")).toEqual({
			verb: "write",
			path: "notes.txt",
		});
		expect(inferShellIntent("cat extra.txt >> notes.txt")).toEqual({
			verb: "edit",
			path: "notes.txt",
		});
		expect(inferShellIntent("sed -i 's/a/b/' src/x.ts")).toEqual({
			verb: "edit",
			path: "src/x.ts",
		});
	});

	test("stays a command for programs, substitution and unknown binaries", () => {
		expect(inferShellIntent("git status")).toBeNull();
		expect(inferShellIntent("bun test src")).toBeNull();
		expect(inferShellIntent("cat $(ls | head -1)")).toBeNull();
		expect(inferShellIntent("cat `which node`")).toBeNull();
		expect(inferShellIntent("cat 'unterminated")).toBeNull();
		expect(inferShellIntent("cat a.ts && npm install")).toBeNull();
		expect(inferShellIntent("grep foo src 2>/dev/null")).toEqual({
			verb: "search",
			query: "foo",
			path: "src",
		});
	});

	test("looks through the shell an agent launched the command with", () => {
		expect(unwrapShellCommand("/bin/zsh -lc 'grep -rn foo src'")).toBe(
			"grep -rn foo src",
		);
		expect(inferShellIntent("/bin/zsh -lc 'cat README.md'")).toEqual({
			verb: "read",
			path: "README.md",
		});
		expect(inferShellIntent('bash -c "ls docs"')).toEqual({
			verb: "list",
			path: "docs",
		});
	});
});

describe("toolCallIntent", () => {
	test("reads the command from rawInput, then from terminal content", () => {
		expect(
			toolCallIntent(execute({ rawInput: { command: "cat a.ts" } })),
		).toEqual({ verb: "read", path: "a.ts" });
		expect(
			toolCallIntent(
				execute({
					content: [{ type: "terminal", command: "ls src", output: "" }],
				}),
			),
		).toEqual({ verb: "list", path: "src" });
		expect(toolCallIntent(execute({}))).toBeNull();
	});

	test("only an execute call is reinterpreted", () => {
		expect(
			toolCallIntent(
				execute({ toolKind: "other", rawInput: { command: "cat a.ts" } }),
			),
		).toBeNull();
	});
});

describe("effectiveToolKind", () => {
	test("files a shell read, search, list or write under that kind", () => {
		expect(
			effectiveToolKind(execute({ rawInput: { command: "cat a.ts" } })),
		).toBe("read");
		expect(
			effectiveToolKind(execute({ rawInput: { command: "grep foo src" } })),
		).toBe("search");
		expect(
			effectiveToolKind(execute({ rawInput: { command: "ls src" } })),
		).toBe("search");
		expect(
			effectiveToolKind(execute({ rawInput: { command: "echo x > y.txt" } })),
		).toBe("edit");
		expect(
			effectiveToolKind(execute({ rawInput: { command: "git status" } })),
		).toBe("execute");
	});
});

describe("inferShellIntent edge cases", () => {
	test("a find that deletes or runs something stays a command", () => {
		expect(inferShellIntent("find . -name '*.log' -delete")).toBeNull();
		expect(inferShellIntent("find src -name '*.ts' -exec rm {} ;")).toBeNull();
	});

	test("substitution inside double quotes still runs", () => {
		expect(inferShellIntent('cat "$(ls | head -1)"')).toBeNull();
		expect(inferShellIntent('cat "`which node`"')).toBeNull();
		expect(inferShellIntent("cat '$(not run)'")).toEqual({
			verb: "read",
			path: "$(not run)",
		});
	});

	test("a quoted redirect target is one path", () => {
		expect(inferShellIntent("echo hi > 'my notes.txt'")).toEqual({
			verb: "write",
			path: "my notes.txt",
		});
		expect(inferShellIntent('echo hi >> "out dir/log.txt"')).toEqual({
			verb: "edit",
			path: "out dir/log.txt",
		});
	});

	test("an absolute directory stays absolute", () => {
		expect(inferShellIntent("cd /repo/src && cat index.ts")).toEqual({
			verb: "read",
			path: "/repo/src/index.ts",
		});
	});

	test("a backslash before an ordinary letter survives in double quotes", () => {
		expect(inferShellIntent('grep -rn "foo\\.bar" src')).toEqual({
			verb: "search",
			query: "foo\\.bar",
			path: "src",
		});
		expect(inferShellIntent('grep -rn "say \\"hi\\"" src')).toEqual({
			verb: "search",
			query: 'say "hi"',
			path: "src",
		});
	});

	test("a stderr redirect is not the command's output", () => {
		expect(inferShellIntent("grep foo src 2> err.log")).toEqual({
			verb: "search",
			query: "foo",
			path: "src",
		});
		expect(inferShellIntent("echo hi 1> out.txt")).toEqual({
			verb: "write",
			path: "out.txt",
		});
	});

	test("a redirect resolves where it ran, not after a later cd", () => {
		expect(inferShellIntent("echo x > out.txt && cd sub")).toEqual({
			verb: "write",
			path: "out.txt",
		});
		expect(inferShellIntent("cd sub && echo x > out.txt")).toEqual({
			verb: "write",
			path: "sub/out.txt",
		});
	});
});

describe("toolCallIntent working directory", () => {
	test("keeps the typed path and records where the command ran", () => {
		const intent = toolCallIntent(
			execute({ rawInput: { command: "cat index.ts", cwd: "/repo/src" } }),
		);
		expect(intent).toEqual({
			verb: "read",
			path: "index.ts",
			cwd: "/repo/src",
		});
		expect(intent && intentLocation(intent)).toBe("/repo/src/index.ts");
	});
});
