import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECTS_DIR_NAME, SUPERSET_DIR_NAME } from "shared/constants";
import { runTeardown } from "./teardown";

const TEST_DIR = join(tmpdir(), `superset-test-teardown-${process.pid}`);
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");
const PROJECT_ID = "test-teardown-project";
const USER_CONFIG_DIR = join(
	homedir(),
	SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	PROJECT_ID,
);

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
		// Clean up user override dir
		if (existsSync(USER_CONFIG_DIR)) {
			rmSync(USER_CONFIG_DIR, { recursive: true, force: true });
		}
	});

	test("returns success when no config exists", async () => {
		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});
		expect(result.success).toBe(true);
		expect(result.error).toBeUndefined();
	});

	test("returns success when config has no teardown commands", async () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["echo setup"] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});
		expect(result.success).toBe(true);
	});

	test("returns success when teardown array is empty", async () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});
		expect(result.success).toBe(true);
	});

	test("reads config from mainRepoPath and executes teardown", async () => {
		// This marker file will be created by the teardown command
		// proving the config was read from mainRepoPath
		const markerFile = join(WORKTREE, "main-repo-config-executed.txt");

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "executed" > "${markerFile}"`] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});

		expect(result.success).toBe(true);
		expect(existsSync(markerFile)).toBe(true);
		expect(readFileSync(markerFile, "utf-8").trim()).toBe("executed");
	});

	test("uses worktreePath config when present", async () => {
		const worktreeMarker = join(WORKTREE, "worktree-config-executed.txt");
		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "executed" > "${worktreeMarker}"`] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});

		expect(result.success).toBe(true);
		expect(existsSync(worktreeMarker)).toBe(true);
		expect(readFileSync(worktreeMarker, "utf-8").trim()).toBe("executed");
	});

	test("prefers worktreePath config over mainRepoPath config", async () => {
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

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});

		expect(result.success).toBe(true);
		expect(existsSync(worktreeMarker)).toBe(true);
		expect(existsSync(mainMarker)).toBe(false);
	});

	test("returns error when teardown command fails", async () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: ["exit 1"] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	test("chains multiple teardown commands with &&", async () => {
		const testFile = join(WORKTREE, "teardown-test.txt");
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				teardown: [`echo "created" > "${testFile}"`, `test -f "${testFile}"`],
			}),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
		});
		expect(result.success).toBe(true);
		expect(existsSync(testFile)).toBe(true);
	});

	test("sets environment variables for teardown scripts", async () => {
		const envFile = join(WORKTREE, "env-test.txt");
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				teardown: [
					`echo "$SUPERSET_WORKSPACE_NAME|$SUPERSET_ROOT_PATH" > "${envFile}"`,
				],
			}),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "my-workspace",
		});
		expect(result.success).toBe(true);

		const content = readFileSync(envFile, "utf-8").trim();
		expect(content).toBe(`my-workspace|${MAIN_REPO}`);
	});

	test("reads from user override when projectId is provided", async () => {
		const mainMarker = join(WORKTREE, "from-main.txt");
		const userMarker = join(WORKTREE, "from-user.txt");

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "main" > "${mainMarker}"`] }),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify({ teardown: [`echo "user" > "${userMarker}"`] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(true);
		expect(existsSync(userMarker)).toBe(true);
		expect(readFileSync(userMarker, "utf-8").trim()).toBe("user");
		expect(existsSync(mainMarker)).toBe(false);
	});

	test("falls back to mainRepoPath when no user override exists", async () => {
		const mainMarker = join(WORKTREE, "from-main.txt");

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: [`echo "main" > "${mainMarker}"`] }),
		);

		const result = await runTeardown({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			workspaceName: "test-workspace",
			projectId: PROJECT_ID,
		});

		expect(result.success).toBe(true);
		expect(existsSync(mainMarker)).toBe(true);
		expect(readFileSync(mainMarker, "utf-8").trim()).toBe("main");
	});
});
