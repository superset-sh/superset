import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECTS_DIR_NAME, SUPERSET_DIR_NAME } from "shared/constants";
import { loadSetupConfig } from "./setup";

const TEST_DIR = join(__dirname, ".test-tmp");
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");
const PROJECT_NAME = "test-project";
const USER_CONFIG_DIR = join(
	homedir(),
	SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	PROJECT_NAME,
);

describe("loadSetupConfig", () => {
	beforeEach(() => {
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
	});

	afterEach(() => {
		// Clean up test dir
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		// Clean up user override dir
		if (existsSync(USER_CONFIG_DIR)) {
			rmSync(USER_CONFIG_DIR, { recursive: true, force: true });
		}
	});

	test("returns null when config.json does not exist", () => {
		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toBeNull();
	});

	test("loads valid setup config from main repo", () => {
		const setupConfig = {
			setup: ["npm install", "npm run build"],
		};

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(setupConfig),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual(setupConfig);
	});

	test("returns null for invalid JSON", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			"{ invalid json",
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toBeNull();
	});

	test("validates setup field must be an array", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: "not-an-array" }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toBeNull();
	});

	test("prefers worktree config over main repo config", () => {
		const mainConfig = { setup: ["./.superset/setup.sh"] };
		const worktreeConfig = { setup: ["scripts/setup-worktree.sh"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify(worktreeConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
		});
		expect(config).toEqual(worktreeConfig);
	});

	test("falls back to main repo when worktree has no config", () => {
		const mainConfig = { setup: ["npm install"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		mkdirSync(WORKTREE, { recursive: true });

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
		});
		expect(config).toEqual(mainConfig);
	});

	test("user override takes priority over main repo config", () => {
		const mainConfig = { setup: ["npm install"] };
		const userConfig = { setup: ["custom-setup.sh"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify(userConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			projectName: PROJECT_NAME,
		});
		expect(config).toEqual(userConfig);
	});

	test("user override takes priority over worktree config", () => {
		const worktreeConfig = { setup: ["worktree-setup.sh"] };
		const userConfig = { setup: ["user-override-setup.sh"] };

		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.json"),
			JSON.stringify(worktreeConfig),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify(userConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
			projectName: PROJECT_NAME,
		});
		expect(config).toEqual(userConfig);
	});

	test("falls back to worktree/main when no user override exists", () => {
		const mainConfig = { setup: ["npm install"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			projectName: PROJECT_NAME,
		});
		expect(config).toEqual(mainConfig);
	});

	test("works when projectName is not provided (backwards compat)", () => {
		const mainConfig = { setup: ["npm install"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
		});
		expect(config).toEqual(mainConfig);
	});

	test("user override with empty arrays skips setup", () => {
		const mainConfig = { setup: ["npm install"] };
		const userConfig = { setup: [], teardown: [] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify(userConfig),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			projectName: PROJECT_NAME,
		});
		expect(config).toEqual(userConfig);
		expect(config?.setup).toEqual([]);
	});

	test("falls back to main repo when user override has invalid JSON", () => {
		const mainConfig = { setup: ["npm install"] };

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(mainConfig),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(join(USER_CONFIG_DIR, "config.json"), "{ invalid json");

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			projectName: PROJECT_NAME,
		});
		expect(config).toEqual(mainConfig);
	});
});
