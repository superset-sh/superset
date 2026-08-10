import { describe, expect, it } from "bun:test";
import { createFileTreeHiddenMatcher } from "./file-tree-patterns";

function entry(relativePath: string, isDirectory = false) {
	const segments = relativePath.split("/");
	return {
		name: segments[segments.length - 1] ?? "",
		relativePath,
		isDirectory,
	};
}

describe("createFileTreeHiddenMatcher", () => {
	it("hides nothing when no patterns are configured", () => {
		const isHidden = createFileTreeHiddenMatcher([]);
		expect(isHidden(entry("node_modules", true))).toBe(false);
		expect(isHidden(entry("src/index.ts"))).toBe(false);
	});

	it("matches a separator-free pattern against the basename at any depth", () => {
		const isHidden = createFileTreeHiddenMatcher(["node_modules"]);
		expect(isHidden(entry("node_modules", true))).toBe(true);
		expect(isHidden(entry("packages/ui/node_modules", true))).toBe(true);
		expect(isHidden(entry("src/node_modules_helper.ts"))).toBe(false);
	});

	it("anchors patterns that start with a slash to the workspace root", () => {
		const isHidden = createFileTreeHiddenMatcher(["/output"]);
		expect(isHidden(entry("output", true))).toBe(true);
		expect(isHidden(entry("src/output", true))).toBe(false);
	});

	it("restricts trailing-slash patterns to directories", () => {
		const isHidden = createFileTreeHiddenMatcher(["build/"]);
		expect(isHidden(entry("build", true))).toBe(true);
		expect(isHidden(entry("build"))).toBe(false);
	});

	it("stops single-star globs at separators", () => {
		const isHidden = createFileTreeHiddenMatcher(["*.log"]);
		expect(isHidden(entry("debug.log"))).toBe(true);
		expect(isHidden(entry("logs/debug.log"))).toBe(true);
		expect(isHidden(entry("debug.log.txt"))).toBe(false);
	});

	it("spans separators for double-star globs", () => {
		const isHidden = createFileTreeHiddenMatcher(["coverage/**"]);
		expect(isHidden(entry("coverage/lcov.info"))).toBe(true);
		expect(isHidden(entry("coverage/html/index.html"))).toBe(true);
		expect(isHidden(entry("coverage"))).toBe(false);
	});

	it("treats a leading double-star as an optional prefix", () => {
		const isHidden = createFileTreeHiddenMatcher(["**/__pycache__"]);
		expect(isHidden(entry("__pycache__", true))).toBe(true);
		expect(isHidden(entry("src/deep/__pycache__", true))).toBe(true);
	});

	it("does not let a dot in a pattern match an arbitrary character", () => {
		const isHidden = createFileTreeHiddenMatcher([".env"]);
		expect(isHidden(entry(".env"))).toBe(true);
		expect(isHidden(entry("xenv"))).toBe(false);
		expect(isHidden(entry("aenv"))).toBe(false);
	});

	it("does not let regex metacharacters in a pattern alter matching", () => {
		const isHidden = createFileTreeHiddenMatcher(["a+b(c)"]);
		expect(isHidden(entry("a+b(c)"))).toBe(true);
		expect(isHidden(entry("aab"))).toBe(false);
		expect(isHidden(entry("abc"))).toBe(false);
	});

	it("ignores blank lines and comments", () => {
		const isHidden = createFileTreeHiddenMatcher([
			"   ",
			"# a comment",
			"dist",
		]);
		expect(isHidden(entry("dist", true))).toBe(true);
		expect(isHidden(entry("src"))).toBe(false);
	});

	it("ignores a pattern that compiles to nothing rather than hiding everything", () => {
		const isHidden = createFileTreeHiddenMatcher(["/", "//"]);
		expect(isHidden(entry("src"))).toBe(false);
		expect(isHidden(entry("package.json"))).toBe(false);
	});

	it("normalizes windows separators before matching path patterns", () => {
		const isHidden = createFileTreeHiddenMatcher(["target/debug"]);
		expect(
			isHidden({
				...entry("target/debug", true),
				relativePath: "target\\debug",
			}),
		).toBe(true);
	});

	it("matches an exact nested path without hiding siblings", () => {
		const isHidden = createFileTreeHiddenMatcher(["packages/ui/dist"]);
		expect(isHidden(entry("packages/ui/dist", true))).toBe(true);
		expect(isHidden(entry("packages/core/dist", true))).toBe(false);
	});
});
