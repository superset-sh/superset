import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copySetupFiles, loadSetupConfig } from "./setup";

const TEST_DIR = join(__dirname, ".test-tmp");
const MAIN_REPO = join(TEST_DIR, "main-repo");
const WORKTREE = join(TEST_DIR, "worktree");

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

	test("returns null when setup.json does not exist", () => {
		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});

	test("loads valid setup config", () => {
		const setupConfig = {
			copy: ["*.env", "package.json"],
			commands: ["npm install", "npm run build"],
		};

		writeFileSync(
			join(MAIN_REPO, ".superset", "setup.json"),
			JSON.stringify(setupConfig),
		);

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toEqual(setupConfig);
	});

	test("returns null for invalid JSON", () => {
		writeFileSync(join(MAIN_REPO, ".superset", "setup.json"), "{ invalid json");

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});

	test("validates copy field must be an array", () => {
		writeFileSync(
			join(MAIN_REPO, ".superset", "setup.json"),
			JSON.stringify({ copy: "not-an-array" }),
		);

		const config = loadSetupConfig(MAIN_REPO);
		expect(config).toBeNull();
	});
});

describe("copySetupFiles", () => {
	beforeEach(() => {
		// Create test directories
		mkdirSync(MAIN_REPO, { recursive: true });
		mkdirSync(WORKTREE, { recursive: true });
	});

	afterEach(() => {
		// Clean up
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns empty result for empty patterns", async () => {
		const result = await copySetupFiles(MAIN_REPO, WORKTREE, []);
		expect(result.copied).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	test("copies matching files", async () => {
		// Create test files
		writeFileSync(join(MAIN_REPO, "test.txt"), "test content");
		writeFileSync(join(MAIN_REPO, "README.md"), "readme");

		const result = await copySetupFiles(MAIN_REPO, WORKTREE, ["*.txt"]);

		expect(result.copied).toContain("test.txt");
		expect(result.errors).toEqual([]);
		expect(existsSync(join(WORKTREE, "test.txt"))).toBe(true);
	});

	test("creates nested directories", async () => {
		// Create nested file
		mkdirSync(join(MAIN_REPO, "src"), { recursive: true });
		writeFileSync(join(MAIN_REPO, "src", "index.ts"), "export {}");

		const result = await copySetupFiles(MAIN_REPO, WORKTREE, ["src/**/*.ts"]);

		expect(result.copied).toContain("src/index.ts");
		expect(existsSync(join(WORKTREE, "src", "index.ts"))).toBe(true);
	});

	test("reports errors for files that don't match", async () => {
		const result = await copySetupFiles(MAIN_REPO, WORKTREE, [
			"nonexistent.txt",
		]);

		expect(result.copied).toEqual([]);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test("copies multiple files matching glob pattern", async () => {
		writeFileSync(join(MAIN_REPO, "file1.txt"), "content1");
		writeFileSync(join(MAIN_REPO, "file2.txt"), "content2");
		writeFileSync(join(MAIN_REPO, "file.md"), "markdown");

		const result = await copySetupFiles(MAIN_REPO, WORKTREE, ["*.txt"]);

		expect(result.copied).toContain("file1.txt");
		expect(result.copied).toContain("file2.txt");
		expect(result.copied).not.toContain("file.md");
		expect(result.errors).toEqual([]);
	});
});
