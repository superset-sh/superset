import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";
import {
	ensureProjectConfigExists,
	getProjectConfigPath,
	getProjectOverrideConfigPath,
} from "./config-paths";

const TEST_DIR = join(tmpdir(), `superset-config-paths-${process.pid}`);
const MAIN_REPO = join(TEST_DIR, "main-repo");
const PROJECT_ID = "config-path-test-project";
const USER_OVERRIDE_DIR = join(
	homedir(),
	SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	PROJECT_ID,
);
const USER_OVERRIDE_FILE = join(USER_OVERRIDE_DIR, CONFIG_FILE_NAME);
const MAIN_CONFIG_FILE = join(
	MAIN_REPO,
	PROJECT_SUPERSET_DIR_NAME,
	CONFIG_FILE_NAME,
);

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
	if (existsSync(USER_OVERRIDE_DIR)) {
		rmSync(USER_OVERRIDE_DIR, { recursive: true, force: true });
	}
});

describe("config path resolution", () => {
	test("returns user override config path when override exists", () => {
		mkdirSync(USER_OVERRIDE_DIR, { recursive: true });
		writeFileSync(USER_OVERRIDE_FILE, '{"setup":["echo override"]}');

		const resolved = getProjectConfigPath(MAIN_REPO, PROJECT_ID);
		expect(resolved).toBe(USER_OVERRIDE_FILE);
	});

	test("creates main repo config when no user override exists", () => {
		mkdirSync(MAIN_REPO, { recursive: true });

		const resolved = ensureProjectConfigExists(
			MAIN_REPO,
			'{"setup":[],"teardown":[]}',
			PROJECT_ID,
		);

		expect(resolved).toBe(MAIN_CONFIG_FILE);
		expect(existsSync(MAIN_CONFIG_FILE)).toBe(true);
		expect(readFileSync(MAIN_CONFIG_FILE, "utf-8")).toBe(
			'{"setup":[],"teardown":[]}',
		);
	});

	test("does not create main repo config when user override exists", () => {
		mkdirSync(MAIN_REPO, { recursive: true });
		mkdirSync(USER_OVERRIDE_DIR, { recursive: true });
		writeFileSync(USER_OVERRIDE_FILE, '{"setup":["echo user"]}');

		const resolved = ensureProjectConfigExists(
			MAIN_REPO,
			'{"setup":[],"teardown":[]}',
			PROJECT_ID,
		);

		expect(resolved).toBe(USER_OVERRIDE_FILE);
		expect(existsSync(USER_OVERRIDE_FILE)).toBe(true);
		expect(existsSync(MAIN_CONFIG_FILE)).toBe(false);
	});

	test("rejects unsafe project IDs for override path", () => {
		expect(getProjectOverrideConfigPath("../escape")).toBeNull();
		expect(getProjectOverrideConfigPath("sub/dir")).toBeNull();
		expect(getProjectOverrideConfigPath("sub\\dir")).toBeNull();
	});
});
