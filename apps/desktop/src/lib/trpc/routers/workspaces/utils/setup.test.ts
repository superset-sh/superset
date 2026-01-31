import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSetupConfig } from "./setup";

const TEST_DIR = join(__dirname, ".test-tmp");
const MAIN_REPO = join(TEST_DIR, "main-repo");

describe("loadSetupConfig", () => {
	beforeEach(() => {
		// Create test directories
		mkdirSync(join(MAIN_REPO, ".superset"), { recursive: true });
	});

	afterEach(() => {
		// Clean up
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns null when config.json does not exist", () => {
		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});

	test("loads valid setup config", () => {
		const setupConfig = {
			setup: ["npm install", "npm run build"],
		};

		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify(setupConfig),
		);

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toEqual(setupConfig);
	});

	test("returns null for invalid JSON", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			"{ invalid json",
		);

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});

	test("validates setup field must be an array", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "config.json"),
			JSON.stringify({ setup: "not-an-array" }),
		);

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});
});
