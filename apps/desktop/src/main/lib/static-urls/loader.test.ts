import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasStaticUrlsConfig, loadStaticUrls } from "./loader";

const TEST_DIR = join(tmpdir(), `superset-test-urls-loader-${process.pid}`);
const WORKTREE_PATH = join(TEST_DIR, "worktree");
const SUPERSET_DIR = join(WORKTREE_PATH, ".superset");
const URLS_FILE = join(SUPERSET_DIR, "urls.json");

describe("loadStaticUrls", () => {
	beforeEach(() => {
		mkdirSync(SUPERSET_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns exists: false when urls.json does not exist", () => {
		rmSync(URLS_FILE, { force: true });
		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result).toEqual({ exists: false, urls: null, error: null });
	});

	test("loads valid urls.json with single url", () => {
		const config = {
			urls: [{ url: "http://localhost:3000", label: "Frontend" }],
		};
		writeFileSync(URLS_FILE, JSON.stringify(config));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result).toEqual({
			exists: true,
			urls: [{ url: "http://localhost:3000", label: "Frontend" }],
			error: null,
		});
	});

	test("loads valid urls.json with multiple urls", () => {
		const config = {
			urls: [
				{
					url: "http://admin.oms.disco-wool.localhost:1355",
					label: "Admin",
				},
				{
					url: "http://api.oms.disco-wool.localhost:1355",
					label: "API",
				},
				{
					url: "http://api.oms.disco-wool.localhost:1355/docs",
					label: "API Docs",
				},
			],
		};
		writeFileSync(URLS_FILE, JSON.stringify(config));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result).toEqual({
			exists: true,
			urls: [
				{
					url: "http://admin.oms.disco-wool.localhost:1355",
					label: "Admin",
				},
				{
					url: "http://api.oms.disco-wool.localhost:1355",
					label: "API",
				},
				{
					url: "http://api.oms.disco-wool.localhost:1355/docs",
					label: "API Docs",
				},
			],
			error: null,
		});
	});

	test("loads urls with variable placeholders (no interpolation at load time)", () => {
		const config = {
			urls: [
				{
					url: "http://admin.oms.${WORKSPACE}.localhost:1355",
					label: "Admin",
				},
			],
		};
		writeFileSync(URLS_FILE, JSON.stringify(config));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result).toEqual({
			exists: true,
			urls: [
				{
					url: "http://admin.oms.${WORKSPACE}.localhost:1355",
					label: "Admin",
				},
			],
			error: null,
		});
	});

	test("trims whitespace from labels", () => {
		const config = {
			urls: [{ url: "http://localhost:3000", label: "  Frontend  " }],
		};
		writeFileSync(URLS_FILE, JSON.stringify(config));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.urls?.[0].label).toBe("Frontend");
	});

	test("trims whitespace from urls", () => {
		const config = {
			urls: [{ url: "  http://localhost:3000  ", label: "Frontend" }],
		};
		writeFileSync(URLS_FILE, JSON.stringify(config));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.urls?.[0].url).toBe("http://localhost:3000");
	});

	test("returns error for invalid JSON syntax", () => {
		writeFileSync(URLS_FILE, "{ invalid json }");

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toContain("Invalid JSON");
	});

	test("returns error when urls.json is not an object", () => {
		writeFileSync(URLS_FILE, '"just a string"');

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls.json must contain a JSON object");
	});

	test("returns error when urls key is missing", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ other: "field" }));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls.json is missing required field 'urls'");
	});

	test("returns error when urls is not an array", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ urls: "not-an-array" }));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("'urls' field must be an array");
	});

	test("returns error when url entry is not an object", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ urls: ["not-an-object"] }));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0] must be an object");
	});

	test("returns error when url field is missing", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ urls: [{ label: "Test" }] }));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0] is missing required field 'url'");
	});

	test("returns error when label field is missing", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({ urls: [{ url: "http://localhost:3000" }] }),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0] is missing required field 'label'");
	});

	test("returns error when url is not a string", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({ urls: [{ url: 3000, label: "Test" }] }),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].url must be a string");
	});

	test("returns error when url is empty", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({ urls: [{ url: "", label: "Test" }] }),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].url cannot be empty");
	});

	test("returns error when url is only whitespace", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({ urls: [{ url: "   ", label: "Test" }] }),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].url cannot be empty");
	});

	test("returns error when label is not a string", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({
				urls: [{ url: "http://localhost:3000", label: 123 }],
			}),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].label must be a string");
	});

	test("returns error when label is empty", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({
				urls: [{ url: "http://localhost:3000", label: "" }],
			}),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].label cannot be empty");
	});

	test("returns error when label is only whitespace", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({
				urls: [{ url: "http://localhost:3000", label: "   " }],
			}),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[0].label cannot be empty");
	});

	test("returns error with correct index for second invalid entry", () => {
		writeFileSync(
			URLS_FILE,
			JSON.stringify({
				urls: [
					{ url: "http://localhost:3000", label: "Valid" },
					{ url: 12345, label: "Test" },
				],
			}),
		);

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.urls).toBeNull();
		expect(result.error).toBe("urls[1].url must be a string");
	});

	test("handles empty urls array", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ urls: [] }));

		const result = loadStaticUrls(WORKTREE_PATH);
		expect(result).toEqual({ exists: true, urls: [], error: null });
	});
});

describe("hasStaticUrlsConfig", () => {
	beforeEach(() => {
		mkdirSync(SUPERSET_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns false when urls.json does not exist", () => {
		expect(hasStaticUrlsConfig(WORKTREE_PATH)).toBe(false);
	});

	test("returns true when urls.json exists", () => {
		writeFileSync(URLS_FILE, JSON.stringify({ urls: [] }));
		expect(hasStaticUrlsConfig(WORKTREE_PATH)).toBe(true);
	});

	test("returns true even when urls.json is invalid", () => {
		writeFileSync(URLS_FILE, "invalid json");
		expect(hasStaticUrlsConfig(WORKTREE_PATH)).toBe(true);
	});
});
