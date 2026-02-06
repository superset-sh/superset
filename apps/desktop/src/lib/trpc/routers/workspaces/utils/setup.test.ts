import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSetupConfig } from "./setup";

const TEST_DIR = join(__dirname, ".test-tmp");
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");

describe("loadSetupConfig", () => {
	beforeEach(() => {
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
	});

	afterEach(() => {
		// Clean up
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
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
});
