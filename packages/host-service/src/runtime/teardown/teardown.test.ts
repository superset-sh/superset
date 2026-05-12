import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTeardownCommand } from "./teardown";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface Sandbox {
	repoPath: string;
	homeDir: string;
	cleanup: () => void;
}

function createSandbox(): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "teardown-resolve-test-"));
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

function writeUserOverride(
	homeDir: string,
	projectId: string,
	content: object,
) {
	const dir = join(homeDir, ".superset", "projects", projectId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "config.json"), JSON.stringify(content), "utf-8");
}

function writeFallbackScript(repoPath: string) {
	const dir = join(repoPath, ".superset");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "teardown.sh"), "#!/bin/bash\necho bye\n", "utf-8");
}

describe("resolveTeardownCommand", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	function resolve() {
		return resolveTeardownCommand({
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			homeDir: sandbox.homeDir,
		});
	}

	it("returns null when no config and no fallback script exist", () => {
		expect(resolve()).toBeNull();
	});

	it("resolves teardown commands from .superset/config.json", () => {
		// Reproduces issue #4371: teardown was previously hardcoded to running
		// .superset/teardown.sh in the worktree, ignoring config.json entirely.
		writeConfig(sandbox.repoPath, {
			setup: ["bun install"],
			teardown: ["docker compose down", "rm -rf tmp/"],
		});
		expect(resolve()).toBe("docker compose down && rm -rf tmp/");
	});

	it("ignores setup when resolving teardown", () => {
		writeConfig(sandbox.repoPath, {
			setup: ["bun install"],
		});
		expect(resolve()).toBeNull();
	});

	it("falls back to bash <repoPath>/.superset/teardown.sh when config has no teardown", () => {
		writeFallbackScript(sandbox.repoPath);
		const cmd = resolve();
		expect(cmd).toBe(
			`bash '${join(sandbox.repoPath, ".superset", "teardown.sh")}'`,
		);
	});

	it("config teardown wins over fallback script", () => {
		writeConfig(sandbox.repoPath, { teardown: ["echo config"] });
		writeFallbackScript(sandbox.repoPath);
		expect(resolve()).toBe("echo config");
	});

	it("user override (per-host machine) replaces project teardown", () => {
		// Reproduces issue #4371: the UI didn't handle multiple hosts because
		// teardown ignored the per-machine override at ~/.superset/projects/<id>/config.json.
		writeConfig(sandbox.repoPath, {
			teardown: ["docker compose down"],
		});
		writeUserOverride(sandbox.homeDir, PROJECT_ID, {
			teardown: ["docker compose down -v"],
		});
		expect(resolve()).toBe("docker compose down -v");
	});

	it("filters whitespace-only teardown entries", () => {
		writeConfig(sandbox.repoPath, {
			teardown: ["", "   ", "docker compose down", "\n"],
		});
		expect(resolve()).toBe("docker compose down");
	});

	it("joins multiple commands with ' && ' so failures short-circuit", () => {
		writeConfig(sandbox.repoPath, {
			teardown: ["a", "b", "c"],
		});
		expect(resolve()).toBe("a && b && c");
	});
});
