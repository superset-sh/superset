import { describe, expect, test } from "bun:test";
import {
	detectLanguage,
	parseDiffNumstat,
	parseGitLog,
	parseNameStatus,
} from "./parse-status";

describe("parseGitLog", () => {
	test("parses basic log output", () => {
		const logOutput = `abc123|abc|Initial commit|John Doe|2024-01-15T10:30:00Z
def456|def|Add feature|Jane Smith|2024-01-16T14:20:00Z`;

		const commits = parseGitLog(logOutput);

		expect(commits).toHaveLength(2);
		expect(commits[0]).toEqual({
			hash: "abc123",
			shortHash: "abc",
			message: "Initial commit",
			author: "John Doe",
			date: new Date("2024-01-15T10:30:00Z"),
			files: [],
		});
		expect(commits[1]).toEqual({
			hash: "def456",
			shortHash: "def",
			message: "Add feature",
			author: "Jane Smith",
			date: new Date("2024-01-16T14:20:00Z"),
			files: [],
		});
	});

	test("handles commit messages containing pipe characters", () => {
		const logOutput = `abc123|abc|fix: handle edge case | add fallback|John Doe|2024-01-15T10:30:00Z`;

		const commits = parseGitLog(logOutput);

		expect(commits).toHaveLength(1);
		expect(commits[0].message).toBe("fix: handle edge case | add fallback");
		expect(commits[0].author).toBe("John Doe");
	});

	test("handles commit messages with multiple pipe characters", () => {
		const logOutput = `abc123|abc|a | b | c | d|Author|2024-01-15T10:30:00Z`;

		const commits = parseGitLog(logOutput);

		expect(commits).toHaveLength(1);
		expect(commits[0].message).toBe("a | b | c | d");
	});

	test("returns empty array for empty input", () => {
		expect(parseGitLog("")).toEqual([]);
		expect(parseGitLog("   ")).toEqual([]);
		expect(parseGitLog("\n\n")).toEqual([]);
	});

	test("skips malformed lines with fewer than 5 parts", () => {
		const logOutput = `abc123|abc|message|author|2024-01-15T10:30:00Z
invalid|line
def456|def|another|person|2024-01-16T14:20:00Z`;

		const commits = parseGitLog(logOutput);

		expect(commits).toHaveLength(2);
		expect(commits[0].hash).toBe("abc123");
		expect(commits[1].hash).toBe("def456");
	});

	test("handles invalid date with fallback to current date", () => {
		const logOutput = `abc123|abc|message|author|not-a-date`;

		const commits = parseGitLog(logOutput);
		const now = new Date();

		expect(commits).toHaveLength(1);
		// Date should be close to now (within 1 second)
		expect(Math.abs(commits[0].date.getTime() - now.getTime())).toBeLessThan(
			1000,
		);
	});

	test("trims whitespace from all fields", () => {
		const logOutput = `  abc123  |  abc  |  message  |  author  |  2024-01-15T10:30:00Z  `;

		const commits = parseGitLog(logOutput);

		expect(commits).toHaveLength(1);
		expect(commits[0].hash).toBe("abc123");
		expect(commits[0].shortHash).toBe("abc");
		expect(commits[0].message).toBe("message");
		expect(commits[0].author).toBe("author");
	});
});

describe("parseDiffNumstat", () => {
	test("parses basic numstat output", () => {
		const numstatOutput = `10	5	src/file1.ts
20	3	src/file2.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.get("src/file1.ts")).toEqual({ additions: 10, deletions: 5 });
		expect(stats.get("src/file2.ts")).toEqual({ additions: 20, deletions: 3 });
	});

	test("handles binary files with dash markers", () => {
		const numstatOutput = `-	-	image.png
10	5	src/code.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.get("image.png")).toEqual({ additions: 0, deletions: 0 });
		expect(stats.get("src/code.ts")).toEqual({ additions: 10, deletions: 5 });
	});

	test("handles renamed files with arrow format", () => {
		const numstatOutput = `5	2	old/path.ts => new/path.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		// Should be accessible by both old and new paths
		expect(stats.get("new/path.ts")).toEqual({ additions: 5, deletions: 2 });
		expect(stats.get("old/path.ts")).toEqual({ additions: 5, deletions: 2 });
	});

	test("handles copied files with arrow format", () => {
		const numstatOutput = `0	0	source.ts => copy.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.get("copy.ts")).toEqual({ additions: 0, deletions: 0 });
		expect(stats.get("source.ts")).toEqual({ additions: 0, deletions: 0 });
	});

	test("handles paths with spaces in rename format", () => {
		const numstatOutput = `3	1	old file.ts => new file.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.get("new file.ts")).toEqual({ additions: 3, deletions: 1 });
		expect(stats.get("old file.ts")).toEqual({ additions: 3, deletions: 1 });
	});

	test("returns empty map for empty input", () => {
		expect(parseDiffNumstat("").size).toBe(0);
		expect(parseDiffNumstat("   ").size).toBe(0);
		expect(parseDiffNumstat("\n\n").size).toBe(0);
	});

	test("skips lines without path", () => {
		const numstatOutput = `10	5
20	3	valid/path.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.size).toBe(1);
		expect(stats.get("valid/path.ts")).toEqual({ additions: 20, deletions: 3 });
	});

	test("handles non-numeric additions/deletions gracefully", () => {
		const numstatOutput = `abc	xyz	file.ts`;

		const stats = parseDiffNumstat(numstatOutput);

		expect(stats.get("file.ts")).toEqual({ additions: 0, deletions: 0 });
	});
});

describe("parseNameStatus", () => {
	test("parses added files", () => {
		const nameStatus = `A	src/new-file.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0]).toEqual({
			path: "src/new-file.ts",
			oldPath: undefined,
			status: "added",
			additions: 0,
			deletions: 0,
		});
	});

	test("parses deleted files", () => {
		const nameStatus = `D	src/removed.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0].status).toBe("deleted");
	});

	test("parses modified files", () => {
		const nameStatus = `M	src/changed.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0].status).toBe("modified");
	});

	test("parses renamed files with percentage", () => {
		const nameStatus = `R100	old/name.ts	new/name.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0]).toEqual({
			path: "new/name.ts",
			oldPath: "old/name.ts",
			status: "renamed",
			additions: 0,
			deletions: 0,
		});
	});

	test("parses copied files with percentage", () => {
		const nameStatus = `C095	source.ts	destination.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0]).toEqual({
			path: "destination.ts",
			oldPath: "source.ts",
			status: "copied",
			additions: 0,
			deletions: 0,
		});
	});

	test("parses multiple files", () => {
		const nameStatus = `A	added.ts
M	modified.ts
D	deleted.ts
R100	old.ts	new.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(4);
		expect(files[0].status).toBe("added");
		expect(files[1].status).toBe("modified");
		expect(files[2].status).toBe("deleted");
		expect(files[3].status).toBe("renamed");
	});

	test("returns empty array for empty input", () => {
		expect(parseNameStatus("")).toEqual([]);
		expect(parseNameStatus("   ")).toEqual([]);
	});

	test("handles unknown status codes as modified", () => {
		const nameStatus = `U	unmerged.ts`;

		const files = parseNameStatus(nameStatus);

		expect(files).toHaveLength(1);
		expect(files[0].status).toBe("modified");
	});
});

describe("detectLanguage", () => {
	test("detects TypeScript files", () => {
		expect(detectLanguage("file.ts")).toBe("typescript");
		expect(detectLanguage("file.tsx")).toBe("typescript");
	});

	test("detects JavaScript files", () => {
		expect(detectLanguage("file.js")).toBe("javascript");
		expect(detectLanguage("file.jsx")).toBe("javascript");
		expect(detectLanguage("file.mjs")).toBe("javascript");
		expect(detectLanguage("file.cjs")).toBe("javascript");
	});

	test("detects web files", () => {
		expect(detectLanguage("index.html")).toBe("html");
		expect(detectLanguage("styles.css")).toBe("css");
		expect(detectLanguage("styles.scss")).toBe("scss");
	});

	test("detects data format files", () => {
		expect(detectLanguage("config.json")).toBe("json");
		expect(detectLanguage("config.yaml")).toBe("yaml");
		expect(detectLanguage("config.yml")).toBe("yaml");
		expect(detectLanguage("config.xml")).toBe("xml");
	});

	test("detects markdown files", () => {
		expect(detectLanguage("README.md")).toBe("markdown");
		expect(detectLanguage("docs.mdx")).toBe("markdown");
	});

	test("detects shell scripts", () => {
		expect(detectLanguage("script.sh")).toBe("shell");
		expect(detectLanguage("script.bash")).toBe("shell");
	});

	test("detects other programming languages", () => {
		expect(detectLanguage("app.py")).toBe("python");
		expect(detectLanguage("main.go")).toBe("go");
		expect(detectLanguage("lib.rs")).toBe("rust");
		expect(detectLanguage("App.java")).toBe("java");
	});

	test("returns plaintext for unknown extensions", () => {
		expect(detectLanguage("file.unknown")).toBe("plaintext");
		expect(detectLanguage("noextension")).toBe("plaintext");
	});

	test("handles case insensitivity", () => {
		expect(detectLanguage("FILE.TS")).toBe("typescript");
		expect(detectLanguage("README.MD")).toBe("markdown");
	});

	test("handles nested paths", () => {
		expect(detectLanguage("src/components/Button.tsx")).toBe("typescript");
		expect(detectLanguage("deep/nested/path/config.json")).toBe("json");
	});
});
