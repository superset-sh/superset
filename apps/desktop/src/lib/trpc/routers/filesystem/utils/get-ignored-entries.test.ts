import { afterAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIgnoredEntries } from "./get-ignored-entries";

const TEST_ROOT = mkdtempSync(
	join(realpathSync(tmpdir()), "superset-ignored-entries-"),
);

function makeRepo(name: string): string {
	const repoPath = join(TEST_ROOT, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@example.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	return repoPath;
}

afterAll(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("getIgnoredEntries", () => {
	test("returns empty set for empty input", async () => {
		const result = await getIgnoredEntries("/tmp", []);
		expect(result.size).toBe(0);
	});

	test("flags entries matching .gitignore", async () => {
		const repo = makeRepo("flags-ignored");
		writeFileSync(join(repo, ".gitignore"), "node_modules\n*.log\n");
		mkdirSync(join(repo, "node_modules"));
		writeFileSync(join(repo, "node_modules", "x.js"), "");
		writeFileSync(join(repo, "debug.log"), "");
		writeFileSync(join(repo, "src.ts"), "");

		const result = await getIgnoredEntries(repo, [
			"node_modules",
			"debug.log",
			"src.ts",
		]);
		expect(result.has("node_modules")).toBe(true);
		expect(result.has("debug.log")).toBe(true);
		expect(result.has("src.ts")).toBe(false);
	});

	test("does not flag tracked files even if they match a pattern", async () => {
		const repo = makeRepo("tracked-not-flagged");
		writeFileSync(join(repo, "keep.log"), "kept");
		execSync("git add keep.log && git commit -m 'init'", {
			cwd: repo,
			stdio: "ignore",
		});
		writeFileSync(join(repo, ".gitignore"), "*.log\n");

		const result = await getIgnoredEntries(repo, ["keep.log"]);
		expect(result.has("keep.log")).toBe(false);
	});

	test("returns empty set in non-git directory", async () => {
		const dir = join(TEST_ROOT, "not-a-repo");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "a.txt"), "");

		const result = await getIgnoredEntries(dir, ["a.txt"]);
		expect(result.size).toBe(0);
	});

	test("preserves filenames with leading whitespace", async () => {
		const repo = makeRepo("space-names");
		// gitignore strips trailing whitespace from patterns unless escaped,
		// so we only assert leading-space round-trip via NUL-delimited I/O.
		writeFileSync(join(repo, ".gitignore"), " spaced.log\n");
		writeFileSync(join(repo, " spaced.log"), "");
		writeFileSync(join(repo, "normal.log"), "");

		const result = await getIgnoredEntries(repo, [" spaced.log", "normal.log"]);
		expect(result.has(" spaced.log")).toBe(true);
		expect(result.has("normal.log")).toBe(false);
	});

	test("respects nested .gitignore files", async () => {
		const repo = makeRepo("nested-gitignore");
		writeFileSync(join(repo, ".gitignore"), "*.tmp\n");
		mkdirSync(join(repo, "sub"));
		writeFileSync(join(repo, "sub", ".gitignore"), "secret.txt\n");
		writeFileSync(join(repo, "sub", "secret.txt"), "");
		writeFileSync(join(repo, "sub", "shared.tmp"), "");
		writeFileSync(join(repo, "sub", "kept.md"), "");

		const result = await getIgnoredEntries(join(repo, "sub"), [
			"secret.txt",
			"shared.tmp",
			"kept.md",
		]);
		expect(result.has("secret.txt")).toBe(true);
		expect(result.has("shared.tmp")).toBe(true);
		expect(result.has("kept.md")).toBe(false);
	});
});
