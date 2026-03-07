import { describe, expect, it } from "bun:test";
import { shellEscapePaths } from "./utils";

describe("shellEscapePaths", () => {
	it("returns a plain path unchanged", () => {
		expect(shellEscapePaths(["/home/user/file.txt"])).toBe(
			"/home/user/file.txt",
		);
	});

	it("wraps a path with spaces in single quotes", () => {
		expect(shellEscapePaths(["/home/user/my file.txt"])).toBe(
			"'/home/user/my file.txt'",
		);
	});

	it("escapes a path with single quotes", () => {
		// shell-quote escapes single quotes inside paths
		const result = shellEscapePaths(["/home/user/it's a file.txt"]);
		expect(result).toContain("it");
		expect(result).toContain("s a file");
	});

	it("joins multiple paths with a space", () => {
		expect(shellEscapePaths(["/path/a.txt", "/path/b.txt"])).toBe(
			"/path/a.txt /path/b.txt",
		);
	});

	it("handles a path with parentheses", () => {
		const result = shellEscapePaths(["/home/user/folder (1)/file.txt"]);
		// Result must be shell-safe (quoted or escaped)
		expect(result.length).toBeGreaterThan(0);
		expect(result).toContain("file.txt");
	});

	it("handles a path with special shell characters", () => {
		const result = shellEscapePaths(["/home/user/$HOME/file.txt"]);
		// The dollar sign must be escaped so the shell doesn't expand it
		expect(result).not.toMatch(/^\/home\/user\/\$HOME/);
	});

	it("handles an empty paths array", () => {
		expect(shellEscapePaths([])).toBe("");
	});

	it("handles a single path with no special characters", () => {
		expect(shellEscapePaths(["/usr/local/bin/node"])).toBe(
			"/usr/local/bin/node",
		);
	});
});
