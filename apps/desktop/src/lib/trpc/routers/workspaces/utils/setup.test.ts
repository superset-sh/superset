import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECTS_DIR_NAME, SUPERSET_DIR_NAME } from "shared/constants";
import { loadSetupConfig, mergeConfigs } from "./setup";

const TEST_DIR = join(tmpdir(), `superset-test-setup-${process.pid}`);
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");
const PROJECT_ID = "test-project-id";
const USER_CONFIG_DIR = join(
	homedir(),
	SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	PROJECT_ID,
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
			projectId: PROJECT_ID,
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
			projectId: PROJECT_ID,
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
			projectId: PROJECT_ID,
		});
		expect(config).toEqual(mainConfig);
	});

	test("works when projectId is not provided (backwards compat)", () => {
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
			projectId: PROJECT_ID,
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
			projectId: PROJECT_ID,
		});
		expect(config).toEqual(mainConfig);
	});
});

describe("config.local.json", () => {
	beforeEach(() => {
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		if (existsSync(USER_CONFIG_DIR)) {
			rmSync(USER_CONFIG_DIR, { recursive: true, force: true });
		}
	});

	test("local config with before/after merges with base setup", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				setup: ["team-setup.sh"],
				teardown: ["team-teardown.sh"],
			}),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({
				setup: { before: ["pre.sh"], after: ["post.sh"] },
			}),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({
			setup: ["pre.sh", "team-setup.sh", "post.sh"],
			teardown: ["team-teardown.sh"],
		});
	});

	test("local config with array overrides base setup entirely", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: ["my-setup.sh"] }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["my-setup.sh"] });
	});

	test("local config only affects specified keys (passthrough)", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				setup: ["team-setup.sh"],
				teardown: ["team-teardown.sh"],
			}),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { after: ["extra.sh"] } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({
			setup: ["team-setup.sh", "extra.sh"],
			teardown: ["team-teardown.sh"],
		});
	});

	test("local config with only before prepends", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { before: ["my-pre.sh"] } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["my-pre.sh", "team-setup.sh"] });
	});

	test("local config with only after appends", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { after: ["my-post.sh"] } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh", "my-post.sh"] });
	});

	test("local config can mix override and merge across keys", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({
				setup: ["team-setup.sh"],
				teardown: ["team-teardown.sh"],
			}),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({
				setup: { after: ["extra.sh"] },
				teardown: ["my-teardown.sh"],
			}),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({
			setup: ["team-setup.sh", "extra.sh"],
			teardown: ["my-teardown.sh"],
		});
	});

	test("worktree local config takes priority over main repo local config", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { after: ["main-extra.sh"] } }),
		);

		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		writeFileSync(
			join(WORKTREE, ".superset", "config.local.json"),
			JSON.stringify({ setup: { after: ["worktree-extra.sh"] } }),
		);

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
		});
		expect(config).toEqual({
			setup: ["team-setup.sh", "worktree-extra.sh"],
		});
	});

	test("falls back to main repo local config when worktree has none", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { after: ["main-extra.sh"] } }),
		);

		mkdirSync(join(WORKTREE, ".superset"), { recursive: true });
		// No config.local.json in worktree

		const config = loadSetupConfig({
			mainRepoPath: MAIN_REPO,
			worktreePath: WORKTREE,
		});
		expect(config).toEqual({
			setup: ["team-setup.sh", "main-extra.sh"],
		});
	});

	test("invalid local config is ignored (base config used as-is)", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			"{ invalid json",
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh"] });
	});

	test("local config with invalid before field is ignored", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { before: "not-an-array" } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh"] });
	});

	test("local config with falsy non-array before/after is rejected", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { before: false } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh"] });
	});

	test("no local config means base config is returned unchanged", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh"] });
	});

	test("local config merges with base that has no setup key", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ teardown: ["team-teardown.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({ setup: { before: ["my-setup.sh"] } }),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({
			teardown: ["team-teardown.sh"],
			setup: ["my-setup.sh"],
		});
	});

	test("empty local config object does not alter base", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["team-setup.sh"] }),
		);
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.local.json"),
			JSON.stringify({}),
		);

		const config = loadSetupConfig({ mainRepoPath: MAIN_REPO });
		expect(config).toEqual({ setup: ["team-setup.sh"] });
	});
});

describe("mergeConfigs", () => {
	test("override with array", () => {
		const result = mergeConfigs({ setup: ["a", "b"] }, { setup: ["x"] });
		expect(result).toEqual({ setup: ["x"] });
	});

	test("prepend with before", () => {
		const result = mergeConfigs(
			{ setup: ["a", "b"] },
			{ setup: { before: ["x"] } },
		);
		expect(result).toEqual({ setup: ["x", "a", "b"] });
	});

	test("append with after", () => {
		const result = mergeConfigs(
			{ setup: ["a", "b"] },
			{ setup: { after: ["x"] } },
		);
		expect(result).toEqual({ setup: ["a", "b", "x"] });
	});

	test("before and after together", () => {
		const result = mergeConfigs(
			{ setup: ["a"] },
			{ setup: { before: ["x"], after: ["y"] } },
		);
		expect(result).toEqual({ setup: ["x", "a", "y"] });
	});

	test("undefined local keys pass through", () => {
		const result = mergeConfigs(
			{ setup: ["a"], teardown: ["b"] },
			{ setup: { after: ["x"] } },
		);
		expect(result).toEqual({ setup: ["a", "x"], teardown: ["b"] });
	});

	test("merge when base key is undefined", () => {
		const result = mergeConfigs({}, { setup: { before: ["x"], after: ["y"] } });
		expect(result).toEqual({ setup: ["x", "y"] });
	});

	test("override both keys", () => {
		const result = mergeConfigs(
			{ setup: ["a"], teardown: ["b"] },
			{ setup: ["x"], teardown: ["y"] },
		);
		expect(result).toEqual({ setup: ["x"], teardown: ["y"] });
	});
});
