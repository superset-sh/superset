import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildSlashCommandRegistry,
	clearSlashCommandRegistryCache,
} from "./registry";
import { resolveSlashCommand } from "./resolver";

const testDirectories: string[] = [];

afterEach(() => {
	clearSlashCommandRegistryCache();
	for (const directory of testDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("resolveSlashCommand template read hardening", () => {
	it("does not throw when a command template file cannot be read", () => {
		const cwd = mkdtempSync(join(tmpdir(), "slash-err-"));
		testDirectories.push(cwd);

		const commandDir = join(cwd, ".claude", "commands");
		mkdirSync(commandDir, { recursive: true });
		const filePath = join(commandDir, "broken.md");
		writeFileSync(
			filePath,
			"---\ndescription: Broken command\n---\nTemplate body",
		);

		buildSlashCommandRegistry(cwd, { useCache: true });

		rmSync(filePath);

		const warn = mock(() => {});
		const originalWarn = console.warn;
		console.warn = warn as unknown as typeof console.warn;

		try {
			const result = resolveSlashCommand(cwd, "/broken");
			expect(result.handled).toBe(true);
			expect(result.commandName).toBe("broken");
			expect(result.prompt).toBe("");
		} finally {
			console.warn = originalWarn;
		}

		expect(warn).toHaveBeenCalled();
	});
});
