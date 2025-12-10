import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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

	test("reads config from mainRepoPath and executes teardown", () => {
		// This marker file will be created by the teardown command
		// proving the config was read from mainRepoPath
		const markerFile = join(WORKTREE, "main-repo-config-executed.txt");

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "executed" > "${markerFile}"`] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");

		expect(result.success).toBe(true);
		expect(existsSync(markerFile)).toBe(true);
		expect(readFileSync(markerFile, "utf-8").trim()).toBe("executed");
	});

	test("ignores config in worktreePath", () => {
		// Put a config ONLY in worktree that would create a marker file
		const worktreeMarker = join(WORKTREE, "worktree-config-executed.txt");
		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "wrong" > "${worktreeMarker}"`] }),
		);

		// Main repo has no config, so nothing should execute
		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");

		expect(result.success).toBe(true);
		// The worktree config should NOT have been read/executed
		expect(existsSync(worktreeMarker)).toBe(false);
	});

	test("uses mainRepoPath config even when worktreePath has different config", () => {
		// Both locations have config - only mainRepoPath should be used
		const mainMarker = join(WORKTREE, "from-main.txt");
		const worktreeMarker = join(WORKTREE, "from-worktree.txt");

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "main" > "${mainMarker}"`] }),
		);

		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "worktree" > "${worktreeMarker}"`] }),
		);

		const result = runTeardown(MAIN_REPO, WORKTREE, "test-workspace");

		expect(result.success).toBe(true);
		expect(existsSync(mainMarker)).toBe(true);
		expect(existsSync(worktreeMarker)).toBe(false);
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
		const testFile = join(WORKTREE, "teardown-test.txt");
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				teardown: [`echo "created" > "${testFile}"`, `test -f "${testFile}"`],
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

		const content = readFileSync(envFile, "utf-8").trim();
		expect(content).toBe(`my-workspace|${MAIN_REPO}`);
	});
});
