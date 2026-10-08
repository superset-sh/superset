import { describe, expect, test } from "bun:test";
import {
	fenceLanguage,
	fenceText,
	isDiffLanguage,
	isSingleFilePatch,
} from "./fencedCode";

describe("fenceLanguage", () => {
	test("reads the language off the class markdown sets", () => {
		expect(fenceLanguage("language-TypeScript")).toBe("typescript");
		expect(fenceLanguage("other language-diff")).toBe("diff");
	});
	test("is null without a language or a string class", () => {
		expect(fenceLanguage("")).toBeNull();
		expect(fenceLanguage(undefined)).toBeNull();
		expect(fenceLanguage("hljs")).toBeNull();
	});
});

describe("fenceText", () => {
	test("joins string children and drops the trailing newline", () => {
		expect(fenceText(["a\n", "b\n"])).toBe("a\nb");
		expect(fenceText("x")).toBe("x");
	});
	test("drops nullish children and keeps numbers", () => {
		expect(fenceText([null, "a", undefined, 1])).toBe("a1");
	});
});

describe("isDiffLanguage", () => {
	test("covers the names agents use for patches", () => {
		expect(isDiffLanguage("diff")).toBe(true);
		expect(isDiffLanguage("patch")).toBe(true);
		expect(isDiffLanguage("ts")).toBe(false);
		expect(isDiffLanguage(null)).toBe(false);
	});
});

const ONE_FILE_PATCH = `--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

const TWO_FILE_PATCH = `${ONE_FILE_PATCH}--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old
+new
`;

describe("isSingleFilePatch", () => {
	test("accepts a patch for one file with hunks", () => {
		expect(isSingleFilePatch(ONE_FILE_PATCH)).toBe(true);
	});
	test("rejects a patch spanning several files", () => {
		expect(isSingleFilePatch(TWO_FILE_PATCH)).toBe(false);
	});
	test("rejects text that is not a patch", () => {
		expect(isSingleFilePatch("const x = 1;")).toBe(false);
		expect(isSingleFilePatch("")).toBe(false);
	});
});
