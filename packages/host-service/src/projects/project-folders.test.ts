import { describe, expect, test } from "bun:test";
import {
	deduplicateFolderName,
	defaultFolderNameForRepo,
	sanitizeFolderName,
} from "./project-folders";

describe("sanitizeFolderName", () => {
	test("accepts a plain directory name", () => {
		expect(sanitizeFolderName(" api ")).toBe("api");
		expect(sanitizeFolderName("web-2")).toBe("web-2");
		expect(sanitizeFolderName("a.b_c")).toBe("a.b_c");
	});

	test("rejects anything that is not one path segment", () => {
		for (const input of [
			"",
			".",
			"..",
			"a/b",
			"a\\b",
			"-leading",
			".hidden",
			"has space",
			"x".repeat(65),
		]) {
			expect(sanitizeFolderName(input)).toBeNull();
		}
	});
});

describe("deduplicateFolderName", () => {
	test("returns the candidate when free", () => {
		expect(deduplicateFolderName("api", ["web"])).toBe("api");
	});

	test("suffixes past every taken name, case-insensitively", () => {
		expect(deduplicateFolderName("api", ["API"])).toBe("api-2");
		expect(deduplicateFolderName("api", ["api", "api-2"])).toBe("api-3");
	});
});

describe("defaultFolderNameForRepo", () => {
	test("uses the directory name", () => {
		expect(defaultFolderNameForRepo("/home/me/code/api")).toBe("api");
	});

	test("slugs a directory name the folder rules would reject", () => {
		expect(defaultFolderNameForRepo("/home/me/my project")).toBe("my-project");
		expect(defaultFolderNameForRepo("/home/me/.dotted")).toBe("dotted");
	});
});
