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

function writeCommandFile(root: string, name: string, body: string): void {
	const commandFilePath = join(root, ".claude", "commands", `${name}.md`);
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
});
