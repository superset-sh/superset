import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveSlashCommand } from "./resolver";

const testDirectories: string[] = [];

function makeTempDirectory(prefix: string): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	testDirectories.push(directory);
	return directory;
}

function writeCommandFile(
	root: string,
	name: string,
	body: string,
	commandRoot: ".claude" | ".agents" = ".claude",
): void {
	const commandFilePath = join(root, commandRoot, "commands", `${name}.md`);
	mkdirSync(dirname(commandFilePath), { recursive: true });
	writeFileSync(commandFilePath, body);
}

afterEach(() => {
	for (const directory of testDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("resolveSlashCommand", () => {
	it("returns handled=false for non-slash text", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		expect(resolveSlashCommand(cwd, "hello world")).toEqual({ handled: false });
	});

	it("returns handled=false for unknown slash command", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		expect(resolveSlashCommand(cwd, "/missing command")).toEqual({
			handled: false,
		});
	});

	it("resolves command body and applies argument placeholders", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"review",
			`---
description: Review changed files
argument-hint: <files>
---
Review these files: $ARGUMENTS
Primary: $1
Secondary: $2`,
		);

		const result = resolveSlashCommand(
			cwd,
			'/review "src/main.ts" docs/README.md',
		);

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("review");
		expect(result.prompt).toBe(
			[
				'Review these files: "src/main.ts" docs/README.md',
				"Primary: src/main.ts",
				"Secondary: docs/README.md",
			].join("\n"),
		);
	});

	it("matches command names case-insensitively", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"cleanup",
			`---
description: Cleanup
---
Clean up this branch.`,
		);

		const result = resolveSlashCommand(cwd, "/CLEANUP");

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("cleanup");
		expect(result.prompt).toBe("Clean up this branch.");
	});

	it("resolves built-in commands when no custom command exists", () => {
		const cwd = makeTempDirectory("slash-cwd-");

		const result = resolveSlashCommand(cwd, "/plan improve caching");

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("plan");
		expect(result.prompt).toContain(
			"If a goal is provided, target this: improve caching",
		);
		expect(result.action).toBeUndefined();
	});

	it("resolves non-prompt built-in actions", () => {
		const cwd = makeTempDirectory("slash-cwd-");

		const stop = resolveSlashCommand(cwd, "/stop");
		expect(stop.handled).toBe(true);
		expect(stop.action?.type).toBe("stop_stream");

		const model = resolveSlashCommand(cwd, "/model gpt-4.1");
		expect(model.handled).toBe(true);
		expect(model.action?.type).toBe("set_model");
		expect(model.action?.argument).toBe("gpt-4.1");
		expect(model.prompt).toContain(
			"Switch active model in this chat. Requested model: gpt-4.1",
		);

		const mcp = resolveSlashCommand(cwd, "/mcp");
		expect(mcp.handled).toBe(true);
		expect(mcp.action?.type).toBe("show_mcp_overview");
	});

	it("keeps model action arguments empty when /model is invoked without args", () => {
		const cwd = makeTempDirectory("slash-cwd-");

		const model = resolveSlashCommand(cwd, "/model");

		expect(model.handled).toBe(true);
		expect(model.action?.type).toBe("set_model");
		expect(model.action?.argument).toBe("");
	});

	it("resolves built-in aliases to the canonical command", () => {
		const cwd = makeTempDirectory("slash-cwd-");

		const result = resolveSlashCommand(cwd, "/clear");

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("new");
		expect(result.invokedAs).toBe("clear");
		expect(result.action?.type).toBe("new_session");
	});

	it("resolves namespaced command names", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"frontend/component",
			`---
description: Component helper
---
Create component in $1`,
		);

		const result = resolveSlashCommand(
			cwd,
			"/frontend/component src/components",
		);

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("frontend/component");
		expect(result.prompt).toBe("Create component in src/components");
	});

	it("supports named placeholders and braced positional placeholders", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"refactor-local",
			`---
description: Refactor helper
---
Scope: ${"$"}{1}
Goal: ${"$"}{GOAL}
Constraints: ${"$"}CONSTRAINTS
Unknown should remain: ${"$"}NOT_SET
Cwd: ${"$"}{CWD}
Command: ${"$"}COMMAND`,
		);

		const result = resolveSlashCommand(
			cwd,
			"/refactor-local src/features goal=simplify --constraints=no-api-change",
		);

		expect(result.handled).toBe(true);
		expect(result.prompt).toContain("Scope: src/features");
		expect(result.prompt).toContain("Goal: simplify");
		expect(result.prompt).toContain("Constraints: no-api-change");
		expect(result.prompt).toContain("Unknown should remain: $NOT_SET");
		expect(result.prompt).toContain(`Cwd: ${cwd}`);
		expect(result.prompt).toContain("Command: refactor-local");
	});

	it("supports quoted named argument values with spaces", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"refactor-local",
			`---
description: Refactor helper
---
Scope: $1
Goal: ${"$"}{GOAL}
Raw: $ARGUMENTS`,
		);

		const result = resolveSlashCommand(
			cwd,
			'/refactor-local src/features goal="improve readability"',
		);

		expect(result.handled).toBe(true);
		expect(result.prompt).toContain("Scope: src/features");
		expect(result.prompt).toContain("Goal: improve readability");
		expect(result.prompt).toContain(
			'Raw: src/features goal="improve readability"',
		);
	});

	it("keeps raw arguments literal when using $ARGUMENTS", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"echo",
			`---
description: Echo helper
---
Raw: $ARGUMENTS`,
		);

		const result = resolveSlashCommand(cwd, '/echo "literal $1"');

		expect(result.handled).toBe(true);
		expect(result.prompt).toBe('Raw: "literal $1"');
	});

	it("resolves custom aliases from frontmatter", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"ship",
			`---
description: Ship helper
aliases: release, publish
---
Ship: $1`,
		);

		const result = resolveSlashCommand(cwd, "/release stable");

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("ship");
		expect(result.invokedAs).toBe("release");
		expect(result.prompt).toBe("Ship: stable");
	});

	it("resolves custom commands from .agents/commands", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		writeCommandFile(
			cwd,
			"agents-only",
			`---
description: Agents command
---
Run from agents root.`,
			".agents",
		);

		const result = resolveSlashCommand(cwd, "/agents-only");

		expect(result.handled).toBe(true);
		expect(result.commandName).toBe("agents-only");
		expect(result.prompt).toBe("Run from agents root.");
	});
});
