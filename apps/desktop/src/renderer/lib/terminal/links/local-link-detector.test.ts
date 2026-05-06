/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLocalLinkDetector.test.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/test/browser/terminalLocalLinkDetector.test.ts
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "bun:test";
import type { StatCallback } from "./link-resolver";
import { TerminalLinkResolver } from "./link-resolver";
import { LocalLinkDetector } from "./local-link-detector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a detector with a mock stat callback. The stat callback simulates
 * the host service's statPath: it checks if the path (or the path resolved
 * against a workspace root) matches any of the valid paths.
 */
function createDetector(validPaths: string[], workspaceRoot = "/parent/cwd") {
	const statMock: StatCallback = async (path) => {
		// Simulate host-side resolution: try raw path, then resolved against root
		if (validPaths.includes(path)) {
			return { isDirectory: false, resolvedPath: path };
		}
		// Simulate host resolving relative paths against workspace root
		// (mirrors what the host service's statPath does with path.resolve)
		if (!path.startsWith("/") && !path.startsWith("~")) {
			const parts = `${workspaceRoot}/${path}`.split("/").filter(Boolean);
			const normalized: string[] = [];
			for (const p of parts) {
				if (p === ".") continue;
				if (p === ".." && normalized.length > 0) {
					normalized.pop();
				} else {
					normalized.push(p);
				}
			}
			const resolved = `/${normalized.join("/")}`;
			if (validPaths.includes(resolved)) {
				return { isDirectory: false, resolvedPath: resolved };
			}
		}
		// Simulate host resolving tilde
		if (path.startsWith("~/")) {
			const resolved = `/home${path.substring(1)}`;
			if (validPaths.includes(resolved)) {
				return { isDirectory: false, resolvedPath: resolved };
			}
		}
		return null;
	};
	const resolver = new TerminalLinkResolver(statMock);
	return new LocalLinkDetector(resolver);
}

function formatLink(
	fmt: string,
	path: string,
	line?: string,
	col?: string,
): string {
	return fmt
		.replace("{0}", path)
		.replace("{1}", line ?? "")
		.replace("{2}", col ?? "");
}

// ---------------------------------------------------------------------------
// Unix link paths
// ---------------------------------------------------------------------------

const unixLinks: { link: string; resolved: string }[] = [
	// Absolute
	{ link: "/foo", resolved: "/foo" },
	{ link: "/foo/bar", resolved: "/foo/bar" },
	{ link: "/foo/bar+more", resolved: "/foo/bar+more" },
	// User home
	{ link: "~/foo", resolved: "/home/foo" },
	// Relative
	{ link: "./foo", resolved: "/parent/cwd/foo" },
	{ link: "../foo", resolved: "/parent/foo" },
	{ link: "foo/bar", resolved: "/parent/cwd/foo/bar" },
	{ link: "foo/bar+more", resolved: "/parent/cwd/foo/bar+more" },
];

// Line/column suffix formats (from VSCode's test suite)
const suffixFormats: { fmt: string; line?: string; col?: string }[] = [
	{ fmt: "{0}" },
	{ fmt: '{0}" on line {1}', line: "5" },
	{ fmt: '{0}" on line {1}, column {2}', line: "5", col: "3" },
	{ fmt: "{0}({1})", line: "5" },
	{ fmt: "{0} ({1})", line: "5" },
	{ fmt: "{0}({1},{2})", line: "5", col: "3" },
	{ fmt: "{0} ({1},{2})", line: "5", col: "3" },
	{ fmt: "{0}({1}, {2})", line: "5", col: "3" },
	{ fmt: "{0}:{1}", line: "5" },
	{ fmt: "{0}:{1}:{2}", line: "5", col: "3" },
	{ fmt: "{0}[{1}]", line: "5" },
	{ fmt: "{0}[{1},{2}]", line: "5", col: "3" },
	{ fmt: "{0}#{1}", line: "5" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocalLinkDetector", () => {
	describe("detect", () => {
		it("should return empty for empty text", async () => {
			const detector = createDetector([]);
			const result = await detector.detect("");
			expect(result).toEqual([]);
		});

		it("should return empty when text exceeds max length", async () => {
			const detector = createDetector([`/${"a".repeat(100)}`]);
			const result = await detector.detect("a".repeat(2001));
			expect(result).toEqual([]);
		});

		it("should detect absolute paths", async () => {
			const detector = createDetector(["/foo/bar.ts"]);
			const result = await detector.detect("see /foo/bar.ts for details");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/foo/bar.ts");
		});

		it("should detect relative paths resolved against cwd", async () => {
			const detector = createDetector(["/parent/cwd/src/file.ts"]);
			const result = await detector.detect("error in ./src/file.ts");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/parent/cwd/src/file.ts");
		});

		it("should detect tilde paths", async () => {
			const detector = createDetector(["/home/.config/foo"]);
			const result = await detector.detect("see ~/.config/foo");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/home/.config/foo");
		});

		it("should NOT detect paths that don't exist", async () => {
			const detector = createDetector([]); // nothing exists
			const result = await detector.detect("see /nonexistent/file.ts");
			expect(result).toEqual([]);
		});

		it("should detect multiple links on one line", async () => {
			const detector = createDetector(["/parent/cwd/foo", "/parent/cwd/bar"]);
			const result = await detector.detect("./foo ./bar");
			expect(result).toHaveLength(2);
			expect(result[0]?.resolvedPath).toBe("/parent/cwd/foo");
			expect(result[1]?.resolvedPath).toBe("/parent/cwd/bar");
		});

		it("should preserve line/column suffix info", async () => {
			const detector = createDetector(["/parent/cwd/file.ts"]);
			const result = await detector.detect("./file.ts:42:10");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/parent/cwd/file.ts");
			expect(result[0]?.row).toBe(42);
			expect(result[0]?.col).toBe(10);
		});

		it("should handle parenthetical line/col format", async () => {
			const detector = createDetector(["/parent/cwd/file.ts"]);
			const result = await detector.detect("./file.ts(5, 3)");
			expect(result).toHaveLength(1);
			expect(result[0]?.row).toBe(5);
			expect(result[0]?.col).toBe(3);
		});

		it("should skip URLs (http/https)", async () => {
			const detector = createDetector([]);
			const result = await detector.detect("visit https://example.com/foo/bar");
			expect(result).toEqual([]);
		});

		it("should limit resolved links per line", async () => {
			// Create 15 valid paths — detector should stop at MAX_RESOLVED_LINKS (10)
			const paths = Array.from({ length: 15 }, (_, i) => `/parent/cwd/f${i}`);
			const detector = createDetector(paths);
			const text = paths.map((_, i) => `./f${i}`).join(" ");
			const result = await detector.detect(text);
			expect(result.length).toBeLessThanOrEqual(10);
		});

		it("should skip links exceeding max link length", async () => {
			const longPath = `/foo/${"a".repeat(1025)}`;
			const detector = createDetector([longPath]);
			const result = await detector.detect(longPath);
			expect(result).toEqual([]);
		});

		it("should detect git diff paths", async () => {
			const detector = createDetector(["/parent/cwd/foo/bar"]);
			const result = await detector.detect("--- a/foo/bar");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/parent/cwd/foo/bar");
		});

		it("should detect git diff --git paths", async () => {
			const detector = createDetector(["/parent/cwd/foo/bar"]);
			const result = await detector.detect("diff --git a/foo/bar b/foo/bar");
			expect(result).toHaveLength(2);
		});
	});

	describe("Unix path formats with suffixes", () => {
		for (const { link, resolved } of unixLinks) {
			for (const { fmt, line, col } of suffixFormats) {
				const formatted = formatLink(fmt, link, line, col);
				it(`should detect "${formatted}"`, async () => {
					const detector = createDetector([resolved]);
					const result = await detector.detect(formatted);
					expect(result.length).toBeGreaterThanOrEqual(1);
					expect(result[0]?.resolvedPath).toBe(resolved);
					if (line) {
						expect(result[0]?.row).toBe(Number.parseInt(line, 10));
					}
					if (col) {
						expect(result[0]?.col).toBe(Number.parseInt(col, 10));
					}
				});
			}
		}
	});

	describe("fallback matchers", () => {
		it("should detect Python-style errors", async () => {
			const detector = createDetector(["/path/to/file.py"]);
			const result = await detector.detect(
				'  File "/path/to/file.py", line 42',
			);
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/path/to/file.py");
			expect(result[0]?.row).toBe(42);
		});

		it("should detect Rust-style errors", async () => {
			const detector = createDetector(["/parent/cwd/src/main.rs"]);
			const result = await detector.detect("   --> src/main.rs:10:5");
			expect(result).toHaveLength(1);
			expect(result[0]?.row).toBe(10);
			expect(result[0]?.col).toBe(5);
		});

		it("should detect C++ compile errors", async () => {
			const detector = createDetector(["/path/to/file.cpp"]);
			const result = await detector.detect(
				"/path/to/file.cpp(339): error C2065",
			);
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/path/to/file.cpp");
			expect(result[0]?.row).toBe(339);
		});

		it("should detect Node.js stack traces", async () => {
			const detector = createDetector(["/path/to/file.js"]);
			const result = await detector.detect(
				"    at Object.<anonymous> (/path/to/file.js:10:5)",
			);
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/path/to/file.js");
			expect(result[0]?.row).toBe(10);
		});

		it("should not use fallback if primary detection found links", async () => {
			// Primary detection should find /path/to/file.ts:10:5
			// Fallback should not run since primary succeeded
			const detector = createDetector(["/path/to/file.ts"]);
			const result = await detector.detect("/path/to/file.ts:10:5");
			expect(result).toHaveLength(1);
			// Should have line info from primary suffix detection
			expect(result[0]?.row).toBe(10);
		});
	});

	describe("trimmed candidates", () => {
		it("should try trimmed path when original has trailing punctuation", async () => {
			// Path followed by a bracket that gets included in the match —
			// generateTrimmedCandidates strips it so the stat succeeds.
			const detector = createDetector(["/foo/bar"]);
			const result = await detector.detect("see /foo/bar.");
			expect(result).toHaveLength(1);
			expect(result[0]?.resolvedPath).toBe("/foo/bar");
		});
	});
});
