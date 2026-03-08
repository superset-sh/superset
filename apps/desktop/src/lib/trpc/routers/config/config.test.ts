import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECTS_DIR_NAME, SUPERSET_DIR_NAME } from "shared/constants";
import { resolveConfigFilePath } from "./utils";

const TEST_DIR = join(tmpdir(), `superset-test-config-${process.pid}`);
const MAIN_REPO = join(TEST_DIR, "main-repo");
const PROJECT_ID = "test-project-id";
const USER_CONFIG_DIR = join(
	homedir(),
	SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	PROJECT_ID,
);

describe("resolveConfigFilePath", () => {
	beforeEach(() => {
		mkdirSync(MAIN_REPO, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		if (existsSync(USER_CONFIG_DIR)) {
			rmSync(USER_CONFIG_DIR, { recursive: true, force: true });
		}
	});

	test("creates local config when no user override exists", () => {
		const result = resolveConfigFilePath(MAIN_REPO, PROJECT_ID);

		expect(result).toBe(join(MAIN_REPO, ".superset", "config.json"));
		expect(existsSync(result)).toBe(true);
	});

	test("does not create local config when user override exists", () => {
		// Set up user override config
		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify({ setup: ["user-setup.sh"] }),
		);

		const result = resolveConfigFilePath(MAIN_REPO, PROJECT_ID);

		// Should return user override path
		expect(result).toBe(join(USER_CONFIG_DIR, "config.json"));

		// Local project config should NOT have been created
		expect(existsSync(join(MAIN_REPO, ".superset", "config.json"))).toBe(false);
	});

	test("returns user override path even when local config also exists", () => {
		// Set up both configs
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: ["local-setup.sh"] }),
		);

		mkdirSync(USER_CONFIG_DIR, { recursive: true });
		writeFileSync(
			join(USER_CONFIG_DIR, "config.json"),
			JSON.stringify({ setup: ["user-setup.sh"] }),
		);

		const result = resolveConfigFilePath(MAIN_REPO, PROJECT_ID);

		expect(result).toBe(join(USER_CONFIG_DIR, "config.json"));
	});

	test("falls back to creating local config when user override dir exists but has no config.json", () => {
		// User override directory exists but no config.json inside
		mkdirSync(USER_CONFIG_DIR, { recursive: true });

		const result = resolveConfigFilePath(MAIN_REPO, PROJECT_ID);

		expect(result).toBe(join(MAIN_REPO, ".superset", "config.json"));
		expect(existsSync(result)).toBe(true);
	});
});
