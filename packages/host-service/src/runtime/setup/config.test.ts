import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getProjectConfigPath,
	hasConfiguredScripts,
	loadSetupConfig,
	resolveScript,
	shellSingleQuote,
} from "./config";

interface Sandbox {
	repoPath: string;
	homeDir: string;
	cleanup: () => void;
}

function createSandbox(): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "setup-config-test-"));
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

function writeRepoConfig(repoPath: string, content: string | object) {
	const dir = join(repoPath, ".superset");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "config.json"),
		typeof content === "string" ? content : JSON.stringify(content),
		"utf-8",
	);
}

function writeRepoLocalConfig(repoPath: string, content: string | object) {
	const dir = join(repoPath, ".superset");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "config.local.json"),
		typeof content === "string" ? content : JSON.stringify(content),
		"utf-8",
	);
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

function writeUserOverrideByPath(
	homeDir: string,
	repoPath: string,
	content: object,
) {
	const dir = join(homeDir, ".superset", "projects", repoPath);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "config.json"), JSON.stringify(content), "utf-8");
}

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

describe("loadSetupConfig", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	function load(args: { projectId?: string } = {}) {
		return loadSetupConfig({
			repoPath: sandbox.repoPath,
			projectId: args.projectId ?? PROJECT_ID,
			homeDir: sandbox.homeDir,
		});
	}

	it("returns null when no config sources exist", () => {
		const result = load();
		expect(result).toBeNull();
	});

	it("returns repo config.json when only that source exists", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: ["bun install"],
			teardown: ["docker compose down"],
		});

		const result = load();

		expect(result).toEqual({
			setup: ["bun install"],
			teardown: ["docker compose down"],
		});
	});

	it("returns null when repo config.json is malformed JSON", () => {
		writeRepoConfig(sandbox.repoPath, "{not valid json,,,");
		const result = load();
		expect(result).toBeNull();
	});

	it("rejects mixed-type arrays and treats config as missing", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: [123, "bun install"],
			teardown: [],
		});

		const result = load();
		expect(result).toBeNull();
	});

	it("rejects when config root is an array (not an object)", () => {
		writeRepoConfig(sandbox.repoPath, ["bun install"]);
		const result = load();
		expect(result).toBeNull();
	});

	it("rejects blank cwd values", () => {
		writeRepoConfig(sandbox.repoPath, {
			cwd: "   ",
			run: ["bun dev"],
		});

		const result = load();
		expect(result).toBeNull();
	});

	it("normalizes configured cwd", () => {
		writeRepoConfig(sandbox.repoPath, {
			cwd: " packages/web ",
			run: ["bun dev"],
		});

		const result = load();
		expect(result?.cwd).toBe("packages/web");
	});

	it("worktree config overrides the repo config per key", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: ["from-repo"],
			teardown: ["repo-teardown"],
		});
		const worktreePath = join(sandbox.repoPath, ".worktrees", "feature");
		writeRepoConfig(worktreePath, { setup: ["from-worktree"] });

		const result = loadSetupConfig({
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			worktreePath,
			homeDir: sandbox.homeDir,
		});

		// Keys the worktree doesn't define fall through to the repo config.
		expect(result).toEqual({
			setup: ["from-worktree"],
			teardown: ["repo-teardown"],
		});
	});

	it("user override still beats the worktree config", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["from-repo"] });
		const worktreePath = join(sandbox.repoPath, ".worktrees", "feature");
		writeRepoConfig(worktreePath, { setup: ["from-worktree"] });
		writeUserOverride(sandbox.homeDir, PROJECT_ID, {
			setup: ["from-user"],
		});

		const result = loadSetupConfig({
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			worktreePath,
			homeDir: sandbox.homeDir,
		});

		expect(result?.setup).toEqual(["from-user"]);
	});

	it("prefers the worktree's config.local.json overlay when present", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["base"] });
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["repo-local"] },
		});
		const worktreePath = join(sandbox.repoPath, ".worktrees", "feature");
		writeRepoLocalConfig(worktreePath, {
			setup: { before: ["worktree-local"] },
		});

		const result = loadSetupConfig({
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			worktreePath,
			homeDir: sandbox.homeDir,
		});

		expect(result?.setup).toEqual(["worktree-local", "base"]);
	});

	it("resolves the user override by repo path", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["from-repo"] });
		writeUserOverrideByPath(sandbox.homeDir, sandbox.repoPath, {
			setup: ["from-path-override"],
		});

		const result = load();
		expect(result?.setup).toEqual(["from-path-override"]);
	});

	it("path-keyed user override wins over the legacy id-keyed one", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["from-repo"] });
		writeUserOverrideByPath(sandbox.homeDir, sandbox.repoPath, {
			setup: ["from-path-override"],
		});
		writeUserOverride(sandbox.homeDir, PROJECT_ID, {
			setup: ["from-id-override"],
		});

		const result = load();
		expect(result?.setup).toEqual(["from-path-override"]);
	});

	it("user override only sets keys it explicitly defines", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: ["bun install"],
			teardown: ["docker compose down"],
		});
		writeUserOverride(sandbox.homeDir, PROJECT_ID, {
			setup: ["bun install --frozen-lockfile"],
		});

		const result = load();

		expect(result).toEqual({
			setup: ["bun install --frozen-lockfile"],
			teardown: ["docker compose down"],
		});
	});

	it("ignores user override path when projectId contains a slash", () => {
		// Path-traversal guard: the loader should refuse to expand the override
		// path for a projectId that looks like a relative path.
		writeRepoConfig(sandbox.repoPath, { setup: ["from-repo"] });
		writeUserOverride(sandbox.homeDir, "../escapee", {
			setup: ["from-override"],
		});
		const result = load({ projectId: "../escapee" });
		expect(result?.setup).toEqual(["from-repo"]);
	});

	it("local overlay 'before' prepends to base", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: ["bun install"],
		});
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["echo before"] },
		});

		const result = load();
		expect(result?.setup).toEqual(["echo before", "bun install"]);
	});

	it("local overlay 'after' appends to base", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["bun install"] });
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { after: ["echo after"] },
		});

		const result = load();
		expect(result?.setup).toEqual(["bun install", "echo after"]);
	});

	it("local overlay before+after wraps the base", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["mid"] });
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["pre"], after: ["post"] },
		});

		const result = load();
		expect(result?.setup).toEqual(["pre", "mid", "post"]);
	});

	it("local overlay as a plain array replaces the base entirely", () => {
		writeRepoConfig(sandbox.repoPath, {
			setup: ["bun install"],
			teardown: ["docker compose down"],
		});
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: ["only this"],
		});

		const result = load();
		expect(result?.setup).toEqual(["only this"]);
		expect(result?.teardown).toEqual(["docker compose down"]);
	});

	it("local overlay only takes effect when there is a base config", () => {
		// loadSetupConfig returns null when no base exists, even if a local
		// overlay is present — the overlay needs something to overlay onto.
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["echo x"] },
		});

		const result = load();
		expect(result).toBeNull();
	});

	it("local overlay with invalid before type is rejected silently", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["bun install"] });
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["ok", 42] },
		});

		const result = load();
		// Invalid local overlay parses to null, so base is returned untouched.
		expect(result?.setup).toEqual(["bun install"]);
	});

	it("stacks repo + user override + local overlay in the right order", () => {
		// repo provides base; user override replaces setup (per-key); local
		// overlay's `before` then prepends to that merged result.
		writeRepoConfig(sandbox.repoPath, { setup: ["a"] });
		writeUserOverride(sandbox.homeDir, PROJECT_ID, { setup: ["b"] });
		writeRepoLocalConfig(sandbox.repoPath, {
			setup: { before: ["pre"] },
		});

		const result = load();
		expect(result?.setup).toEqual(["pre", "b"]);
	});

	it("user override with explicit empty array clears base setup", () => {
		// Load-bearing semantic: mergeBaseConfigs uses `??`, so an empty array
		// in the override wins over the base. Switching to `||` would silently
		// let the base fall through.
		writeRepoConfig(sandbox.repoPath, {
			setup: ["from-repo"],
			teardown: ["keep-me"],
		});
		writeUserOverride(sandbox.homeDir, PROJECT_ID, { setup: [] });

		const result = load();
		expect(result?.setup).toEqual([]);
		expect(result?.teardown).toEqual(["keep-me"]);
	});

	it("returns the config when only some keys are defined", () => {
		// Config with no `setup` key at all should still load, with teardown
		// alone. `setup` stays undefined rather than being defaulted to [].
		writeRepoConfig(sandbox.repoPath, { teardown: ["docker compose down"] });

		const result = load();
		expect(result).toEqual({ teardown: ["docker compose down"] });
		expect(result?.setup).toBeUndefined();
	});

	it("does not consult any worktree-level config", () => {
		// The plan promises the worktree is not consulted. Even if a sibling
		// worktree has its own config.json, loadSetupConfig only reads the
		// main repoPath.
		writeRepoConfig(sandbox.repoPath, { setup: ["from-main"] });
		const fakeWorktree = join(sandbox.repoPath, "..", "fake-worktree");
		writeRepoConfig(fakeWorktree, { setup: ["from-worktree"] });

		const result = load();
		expect(result?.setup).toEqual(["from-main"]);
	});
});

describe("hasConfiguredScripts", () => {
	it("returns false for null", () => {
		expect(hasConfiguredScripts(null)).toBe(false);
	});

	it("returns false when all arrays are empty", () => {
		expect(hasConfiguredScripts({ setup: [], teardown: [], run: [] })).toBe(
			false,
		);
	});

	it("returns false when arrays contain only whitespace strings", () => {
		expect(hasConfiguredScripts({ setup: ["", "   "], teardown: ["\n"] })).toBe(
			false,
		);
	});

	it("returns true when setup has any non-empty command", () => {
		expect(hasConfiguredScripts({ setup: ["bun install"] })).toBe(true);
	});

	it("returns true when only teardown is set", () => {
		expect(hasConfiguredScripts({ teardown: ["docker compose down"] })).toBe(
			true,
		);
	});

	it("returns true when only run is set (so the card hides for run-only)", () => {
		// The setup CTA should still hide when a project only configured the
		// workspace Run button.
		expect(hasConfiguredScripts({ run: ["bun dev"] })).toBe(true);
	});
});

describe("resolveScript", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	function resolve(key: "setup" | "teardown" | "run") {
		return resolveScript(key, {
			repoPath: sandbox.repoPath,
			projectId: PROJECT_ID,
			homeDir: sandbox.homeDir,
		});
	}

	function writeFallbackScript(key: string) {
		const dir = join(sandbox.repoPath, ".superset");
		mkdirSync(dir, { recursive: true });
		const scriptPath = join(dir, `${key}.sh`);
		writeFileSync(scriptPath, "#!/usr/bin/env bash\n", "utf-8");
		return scriptPath;
	}

	it("returns null when no config and no fallback script exist", () => {
		expect(resolve("setup")).toBeNull();
		expect(resolve("teardown")).toBeNull();
		expect(resolve("run")).toBeNull();
	});

	it("returns configured commands, filtering empty entries", () => {
		writeRepoConfig(sandbox.repoPath, {
			teardown: ["docker compose down", "", "   ", "rm -rf .cache"],
		});
		expect(resolve("teardown")).toEqual({
			kind: "commands",
			commands: ["docker compose down", "rm -rf .cache"],
		});
	});

	it("only resolves the requested key", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["bun install"] });
		expect(resolve("setup")).toEqual({
			kind: "commands",
			commands: ["bun install"],
		});
		expect(resolve("teardown")).toBeNull();
		expect(resolve("run")).toBeNull();
	});

	it("falls back to <repoPath>/.superset/<key>.sh per key", () => {
		const setupScript = writeFallbackScript("setup");
		const teardownScript = writeFallbackScript("teardown");
		expect(resolve("setup")).toEqual({
			kind: "script",
			scriptPath: setupScript,
		});
		expect(resolve("teardown")).toEqual({
			kind: "script",
			scriptPath: teardownScript,
		});
		expect(resolve("run")).toBeNull();
	});

	it("prefers the worktree script when worktreePath is in scope", () => {
		writeFallbackScript("teardown");
		const worktreePath = join(sandbox.repoPath, ".worktrees", "feature");
		mkdirSync(join(worktreePath, ".superset"), { recursive: true });
		const worktreeScript = join(worktreePath, ".superset", "teardown.sh");
		writeFileSync(worktreeScript, "#!/usr/bin/env bash\n", "utf-8");

		expect(
			resolveScript("teardown", {
				repoPath: sandbox.repoPath,
				projectId: PROJECT_ID,
				worktreePath,
				homeDir: sandbox.homeDir,
			}),
		).toEqual({ kind: "script", scriptPath: worktreeScript });
	});

	it("falls back to the main repo script when the worktree has none", () => {
		const teardownScript = writeFallbackScript("teardown");
		expect(
			resolveScript("teardown", {
				repoPath: sandbox.repoPath,
				projectId: PROJECT_ID,
				worktreePath: join(sandbox.repoPath, ".worktrees", "feature"),
				homeDir: sandbox.homeDir,
			}),
		).toEqual({ kind: "script", scriptPath: teardownScript });
	});

	it("worktree config commands override the main repo's", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["from-repo"] });
		const worktreePath = join(sandbox.repoPath, ".worktrees", "feature");
		writeRepoConfig(worktreePath, { setup: ["from-worktree"] });

		expect(
			resolveScript("setup", {
				repoPath: sandbox.repoPath,
				projectId: PROJECT_ID,
				worktreePath,
				homeDir: sandbox.homeDir,
			}),
		).toEqual({ kind: "commands", commands: ["from-worktree"] });
	});

	it("configured commands win over the fallback script", () => {
		writeRepoConfig(sandbox.repoPath, { setup: ["bun install"] });
		writeFallbackScript("setup");
		expect(resolve("setup")).toEqual({
			kind: "commands",
			commands: ["bun install"],
		});
	});

	it("carries cwd on both command and script resolutions", () => {
		writeRepoConfig(sandbox.repoPath, { cwd: "apps/web", run: ["bun dev"] });
		const teardownScript = writeFallbackScript("teardown");
		expect(resolve("run")).toEqual({
			kind: "commands",
			commands: ["bun dev"],
			cwd: "apps/web",
		});
		expect(resolve("teardown")).toEqual({
			kind: "script",
			scriptPath: teardownScript,
			cwd: "apps/web",
		});
	});
});

describe("shellSingleQuote", () => {
	it("escapes embedded single quotes", () => {
		expect(shellSingleQuote("it's a path")).toBe("'it'\\''s a path'");
	});
});

describe("getProjectConfigPath", () => {
	it("appends .superset/config.json to the repoPath", () => {
		expect(getProjectConfigPath("/tmp/x")).toBe("/tmp/x/.superset/config.json");
	});
});
