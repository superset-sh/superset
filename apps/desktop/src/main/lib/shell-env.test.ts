import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mergePathFromShell } from "./shell-env";

describe("shell-env", () => {
	describe("mergePathFromShell", () => {
		let originalPath: string | undefined;

		beforeEach(() => {
			originalPath = process.env.PATH;
		});

		afterEach(() => {
			process.env.PATH = originalPath;
		});

		it("should prepend new paths from shell", () => {
			process.env.PATH = "/usr/bin:/bin";
			const result = mergePathFromShell("/opt/homebrew/bin:/usr/bin:/bin");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin");
		});

		it("should return false when no new paths to add", () => {
			process.env.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
			const result = mergePathFromShell("/usr/bin:/bin");

			expect(result).toBe(false);
			expect(process.env.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin");
		});

		it("should preserve existing paths", () => {
			process.env.PATH = "/electron/path:/usr/bin";
			const result = mergePathFromShell("/new/path:/usr/bin");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/new/path:/electron/path:/usr/bin");
		});

		it("should handle empty current PATH", () => {
			process.env.PATH = "";
			const result = mergePathFromShell("/usr/bin:/bin");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/usr/bin:/bin");
		});

		it("should handle empty shell PATH", () => {
			process.env.PATH = "/usr/bin";
			const result = mergePathFromShell("");

			expect(result).toBe(false);
			expect(process.env.PATH).toBe("/usr/bin");
		});

		it("should deduplicate paths", () => {
			process.env.PATH = "/usr/bin:/bin";
			const result = mergePathFromShell("/new/path:/usr/bin:/another:/bin");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/new/path:/another:/usr/bin:/bin");
		});

		it("should filter empty path segments", () => {
			process.env.PATH = "/usr/bin::/bin";
			const result = mergePathFromShell("/new/path:::/usr/bin");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/new/path:/usr/bin::/bin");
		});

		it("should maintain shell path order for new entries", () => {
			process.env.PATH = "/existing";
			const result = mergePathFromShell("/first:/second:/third");

			expect(result).toBe(true);
			expect(process.env.PATH).toBe("/first:/second:/third:/existing");
		});
	});
});
