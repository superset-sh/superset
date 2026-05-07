import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInitialCommand } from "./setup-terminal";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface Sandbox {
	repoPath: string;
	homeDir: string;
	cleanup: () => void;
}

function createSandbox(): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "setup-terminal-test-"));
	const repoPath = join(root, "repo");
	const homeDir = join(root, "home");
	mkdirSync(repoPath, { recursive: true });
	mkdirSync(homeDir, { recursive: true });
	return {
		repoPath,
		homeDir,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function writeConfig(repoPath: string, content: object) {
	const dir = join(repoPath, ".superset");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "config.json"), JSON.stringify(content), "utf-8");
}

function writeFallbackScript(repoPath: string) {
	const dir = join(repoPath, ".superset");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "setup.sh"), "#!/bin/bash\necho hi\n", "utf-8");
}

describe("resolveInitialCommand", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	function resolve() {
		return resolveInitialCommand({
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			homeDir: sandbox.homeDir,
		});
	}

	it("returns null when no config and no fallback script exist", () => {
		expect(resolve()).toBeNull();
	});

	it("joins multi-line setup commands with ' && '", () => {
		writeConfig(sandbox.repoPath, {
			setup: ["bun install", "bun run db:migrate"],
		});
		expect(resolve()).toBe("bun install && bun run db:migrate");
	});

	it("returns the single command when setup has only one line", () => {
		writeConfig(sandbox.repoPath, { setup: ["bun install"] });
		expect(resolve()).toBe("bun install");
	});

	it("falls back to bash <repoPath>/.superset/setup.sh when config is empty", () => {
		writeConfig(sandbox.repoPath, { setup: [], teardown: [] });
		writeFallbackScript(sandbox.repoPath);

		const cmd = resolve();
		expect(cmd).toBe(
			`bash '${join(sandbox.repoPath, ".superset", "setup.sh")}'`,
		);
	});

	it("falls back to setup.sh when no config.json exists at all", () => {
		writeFallbackScript(sandbox.repoPath);
		const cmd = resolve();
		expect(cmd).toBe(
			`bash '${join(sandbox.repoPath, ".superset", "setup.sh")}'`,
		);
	});

	it("config setup wins over the fallback script", () => {
		writeConfig(sandbox.repoPath, { setup: ["bun install"] });
		writeFallbackScript(sandbox.repoPath);
		expect(resolve()).toBe("bun install");
	});

	it("ignores teardown when resolving the setup command", () => {
		writeConfig(sandbox.repoPath, {
			setup: [],
			teardown: ["docker compose down"],
		});
		expect(resolve()).toBeNull();
	});

	it("filters whitespace-only setup entries", () => {
		writeConfig(sandbox.repoPath, {
			setup: ["", "   ", "bun install", "\n"],
		});
		expect(resolve()).toBe("bun install");
	});

	it("escapes single quotes in fallback path", () => {
		const sandboxWithQuote = createSandbox();
		try {
			const trickyRepo = join(sandboxWithQuote.repoPath, "it's a repo");
			writeFallbackScript(trickyRepo);
			const cmd = resolveInitialCommand({
				repoPath: trickyRepo,
				projectId: PROJECT_ID,
				homeDir: sandboxWithQuote.homeDir,
			});
			expect(cmd).toContain("'\\''");
			// Verify the escape sequence wraps the single quote correctly.
			expect(cmd).toBe(
				`bash '${trickyRepo.replace("'", "'\\''")}/.superset/setup.sh'`,
			);
		} finally {
			sandboxWithQuote.cleanup();
		}
	});

	it("does not consult worktree-level config (uses main repoPath)", () => {
		writeConfig(sandbox.repoPath, { setup: ["from-main"] });
		// A sibling worktree directory with its own config should be ignored.
		const sibling = join(sandbox.repoPath, "..", "sibling-worktree");
		writeConfig(sibling, { setup: ["from-worktree"] });

		expect(resolve()).toBe("from-main");
	});
});
