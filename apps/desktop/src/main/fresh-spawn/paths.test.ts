import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveFreshExecBinaryPath, resolveFreshExecHookPath } from "./paths";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-fresh-spawn-paths-${process.pid}-${Date.now()}`,
);

describe("resolveFreshExecBinaryPath", () => {
	beforeEach(() => {
		mkdirSync(TEST_ROOT, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("returns the path when fresh-exec.js exists in mainDir", () => {
		const mainDir = path.join(TEST_ROOT, "main-bundle");
		mkdirSync(mainDir, { recursive: true });
		const freshExecPath = path.join(mainDir, "fresh-exec.js");
		writeFileSync(freshExecPath, "// stub\n");

		const result = resolveFreshExecBinaryPath(mainDir);
		expect(result).toBe(freshExecPath);
	});

	it("returns null when fresh-exec.js does not exist", () => {
		const mainDir = path.join(TEST_ROOT, "empty-main");
		mkdirSync(mainDir, { recursive: true });

		const result = resolveFreshExecBinaryPath(mainDir);
		expect(result).toBeNull();
	});

	it("returns null when mainDir does not exist", () => {
		const mainDir = path.join(TEST_ROOT, "does-not-exist");
		const result = resolveFreshExecBinaryPath(mainDir);
		expect(result).toBeNull();
	});
});

describe("resolveFreshExecHookPath", () => {
	beforeEach(() => {
		mkdirSync(TEST_ROOT, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("returns the hook path when zsh-fresh-exec.zsh exists under shell-hooks/", () => {
		const resourcesDir = path.join(TEST_ROOT, "resources");
		mkdirSync(path.join(resourcesDir, "shell-hooks"), { recursive: true });
		const hookPath = path.join(
			resourcesDir,
			"shell-hooks",
			"zsh-fresh-exec.zsh",
		);
		writeFileSync(hookPath, "# stub\n");

		const result = resolveFreshExecHookPath([resourcesDir]);
		expect(result).toBe(hookPath);
	});

	it("returns the first candidate that exists", () => {
		const missingDir = path.join(TEST_ROOT, "missing");
		const foundDir = path.join(TEST_ROOT, "found");
		mkdirSync(path.join(foundDir, "shell-hooks"), { recursive: true });
		const hookPath = path.join(foundDir, "shell-hooks", "zsh-fresh-exec.zsh");
		writeFileSync(hookPath, "# stub\n");

		const result = resolveFreshExecHookPath([missingDir, foundDir]);
		expect(result).toBe(hookPath);
	});

	it("skips empty-string candidates without throwing", () => {
		const foundDir = path.join(TEST_ROOT, "found-after-empty");
		mkdirSync(path.join(foundDir, "shell-hooks"), { recursive: true });
		const hookPath = path.join(foundDir, "shell-hooks", "zsh-fresh-exec.zsh");
		writeFileSync(hookPath, "# stub\n");

		const result = resolveFreshExecHookPath(["", foundDir]);
		expect(result).toBe(hookPath);
	});

	it("returns null when no candidate contains the hook", () => {
		const dir1 = path.join(TEST_ROOT, "dir1");
		const dir2 = path.join(TEST_ROOT, "dir2");
		mkdirSync(dir1, { recursive: true });
		mkdirSync(dir2, { recursive: true });

		const result = resolveFreshExecHookPath([dir1, dir2]);
		expect(result).toBeNull();
	});

	it("returns null when searchDirs is empty", () => {
		const result = resolveFreshExecHookPath([]);
		expect(result).toBeNull();
	});
});
