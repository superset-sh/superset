import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTeardown } from "./teardown";

const TEST_DIR = join(__dirname, ".test-tmp-teardown");
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");

describe("runTeardown", () => {
	beforeEach(() => {
		// Create test directories
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
		mkdirSync(WORKTREE, { recursive: true });
	});

	afterEach(() => {
		// Clean up
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns success when no config exists", () => {
		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
		expect(result.error).toBeUndefined();
	});

	test("returns success when config has no teardown commands", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["echo setup"] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
	});

	test("returns success when teardown array is empty", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
	});

	test("reads config from mainRepoPath, not worktreePath", () => {
		// Put config ONLY in main repo (not in worktree)
		// This is the key test - it verifies the bug fix
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: ["echo teardown-from-main-repo"] }),
		);

		// Worktree has NO config - if the code incorrectly reads from worktree, it would return early
		// But since it reads from mainRepoPath, it should find the config and execute

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		// The command should execute (echo always succeeds)
		expect(result.success).toBe(true);
	});

	test("does NOT read config from worktreePath", () => {
		// Put config ONLY in worktree (not in main repo)
		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify({ teardown: ["exit 1"] }), // Would fail if executed
		);

		// Main repo has NO config
		// If the code incorrectly reads from worktree, it would find this config and fail
		// But since it reads from mainRepoPath (which has no config), it should return early with success

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
	});

	test("executes teardown commands successfully", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: ["echo hello"] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
	});

	test("returns error when teardown command fails", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: ["exit 1"] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	test("chains multiple teardown commands with &&", () => {
		// Create a file in first command, check it exists in second
		const testFile = join(WORKTREE, "teardown-test.txt");
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				teardown: [
					`echo "created" > "${testFile}"`,
					`test -f "${testFile}"`,
				],
			}),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");
		expect(result.success).toBe(true);
		expect(existsSync(testFile)).toBe(true);
	});

	test("sets environment variables for teardown scripts", () => {
		const envFile = join(WORKTREE, "env-test.txt");
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				teardown: [
					`echo "$SUPERSET_WORKSPACE_NAME|$SUPERSET_ROOT_PATH" > "${envFile}"`,
				],
			}),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "my-workspace");
		expect(result.success).toBe(true);

		const { readFileSync } = require("node:fs");
		const content = readFileSync(envFile, "utf-8").trim();
		expect(content).toBe(`my-workspace|${MAIN_REPO}`);
	});
});
