import { describe, expect, test } from "bun:test";
import {
	formatPrContext,
	isGeneratedPath,
	MAX_PATHSPEC_ARGS,
	type PrContext,
	type PrContextFile,
	parseCommitLog,
	parseNumstat,
	selectPatchPathspec,
	slicePatch,
} from "./pr-context";

function file(path: string, extra: Partial<PrContextFile> = {}): PrContextFile {
	return {
		path,
		additions: 1,
		deletions: 0,
		generated: isGeneratedPath(path),
		...extra,
	};
}

describe("isGeneratedPath", () => {
	test("lockfiles, catalogs, snapshots, and codegen dirs are generated", () => {
		for (const path of [
			"bun.lock",
			"apps/web/package-lock.json",
			"packages/i18n/locales/de/messages.po",
			"packages/i18n/locales/de/messages.ts",
			"src/__snapshots__/x.test.ts.snap",
			"src/foo.generated.ts",
			"packages/db/drizzle/meta/_journal.json",
			"packages/db/drizzle/meta/0001_snapshot.json",
			"dist/app.min.js",
			"src/__generated__/schema.ts",
		]) {
			expect(isGeneratedPath(path), path).toBe(true);
		}
	});

	test("source files are not", () => {
		for (const path of [
			"packages/i18n/src/locales.ts",
			"packages/db/drizzle/0001_add_table.sql",
			"apps/desktop/src/renderer/lockfile-viewer.tsx",
			"docs/generated-content.md",
			"src/messages.ts",
		]) {
			expect(isGeneratedPath(path), path).toBe(false);
		}
	});
});

describe("parseCommitLog", () => {
	test("splits records and keeps multi-line bodies", () => {
		const raw = [
			"aaaa\x1fa1\x1ffeat: one\x1fbody line 1\n\nbody line 2\n\x1e",
			"bbbb\x1fb1\x1ffix: two\x1f\x1e",
		].join("\n");
		expect(parseCommitLog(raw)).toEqual([
			{
				hash: "aaaa",
				shortHash: "a1",
				subject: "feat: one",
				body: "body line 1\n\nbody line 2",
			},
			{ hash: "bbbb", shortHash: "b1", subject: "fix: two", body: "" },
		]);
	});

	test("empty log yields no commits", () => {
		expect(parseCommitLog("")).toEqual([]);
		expect(parseCommitLog("\n")).toEqual([]);
	});
});

describe("parseNumstat", () => {
	test("reads counts, binaries, and -z renames", () => {
		const raw = [
			"3\t1\tsrc/a.ts\0",
			"-\t-\tassets/logo.png\0",
			"0\t0\t\0old/name.ts\0new/name.ts\0",
			"2\t0\tbun.lock\0",
		].join("");
		expect(parseNumstat(raw)).toEqual([
			{ path: "src/a.ts", additions: 3, deletions: 1, generated: false },
			{
				path: "assets/logo.png",
				additions: null,
				deletions: null,
				generated: false,
			},
			{
				path: "new/name.ts",
				additions: 0,
				deletions: 0,
				previousPath: "old/name.ts",
				generated: false,
			},
			{ path: "bun.lock", additions: 2, deletions: 0, generated: true },
		]);
	});
});

describe("selectPatchPathspec", () => {
	test("whole tree when nothing is generated", () => {
		expect(selectPatchPathspec([file("a.ts"), file("b.ts")])).toEqual(["."]);
	});

	test("excludes generated paths (and their rename sources) literally", () => {
		expect(
			selectPatchPathspec([
				file("a.ts"),
				file("bun.lock"),
				file("locales/de/messages.po", { previousPath: "old/messages.po" }),
			]),
		).toEqual([
			".",
			":(exclude,literal)bun.lock",
			":(exclude,literal)locales/de/messages.po",
			":(exclude,literal)old/messages.po",
		]);
	});

	test("null when only generated files changed", () => {
		expect(selectPatchPathspec([file("bun.lock")])).toBeNull();
	});

	test("flips to the include side when the exclude side is too long", () => {
		const generated = Array.from({ length: MAX_PATHSPEC_ARGS + 1 }, (_, i) =>
			file(`locales/${i}/messages.po`),
		);
		expect(selectPatchPathspec([...generated, file("a.ts")])).toEqual([
			":(literal)a.ts",
		]);
	});

	test("gives up when both sides are too long", () => {
		const generated = Array.from({ length: MAX_PATHSPEC_ARGS + 1 }, (_, i) =>
			file(`locales/${i}/messages.po`),
		);
		const included = Array.from({ length: MAX_PATHSPEC_ARGS + 1 }, (_, i) =>
			file(`src/${i}.ts`),
		);
		expect(selectPatchPathspec([...generated, ...included])).toBeNull();
	});
});

function section(name: string, lines: number): string {
	const body = Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n");
	return `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -0,0 +1,${lines} @@\n${body}\n`;
}

describe("slicePatch", () => {
	test("keeps whole files while under budget and counts the rest", () => {
		const a = section("a.ts", 5);
		const b = section("b.ts", 5);
		const c = section("c.ts", 200);
		const result = slicePatch(a + b + c, a.length + b.length + 10);
		expect(result.text).toBe(a + b);
		expect(result.includedFiles).toBe(2);
		expect(result.omittedFiles).toBe(1);
		expect(result.truncated).toBe(true);
	});

	test("a later small file still fits after a big one is skipped", () => {
		const big = section("big.ts", 500);
		const small = section("small.ts", 2);
		const result = slicePatch(big + small, small.length + 10);
		expect(result.text).toBe(small);
		expect(result.includedFiles).toBe(1);
		expect(result.omittedFiles).toBe(1);
	});

	test("cuts the first file at a line boundary when nothing fits", () => {
		const big = section("big.ts", 500);
		const result = slicePatch(big, 200);
		expect(result.includedFiles).toBe(0);
		expect(result.omittedFiles).toBe(1);
		expect(result.text.startsWith("diff --git a/big.ts")).toBe(true);
		expect(result.text).toContain("[... diff truncated by Superset");
		const cut = result.text.split("\n[... diff truncated")[0] ?? "";
		expect(cut.endsWith("\n")).toBe(true);
		expect(Buffer.byteLength(cut, "utf8")).toBeLessThanOrEqual(200);
	});

	test("empty patch", () => {
		expect(slicePatch("")).toEqual({
			text: "",
			includedFiles: 0,
			omittedFiles: 0,
			truncated: false,
		});
	});
});

describe("formatPrContext", () => {
	const base: PrContext = {
		head: "feat/thing",
		base: { name: "main", ref: "origin/main" },
		commits: [
			{
				hash: "aaaa",
				shortHash: "a1",
				subject: "feat(x): add thing",
				body: "Why: because.\n\nCloses #12",
			},
		],
		files: [
			file("src/x.ts", { additions: 10, deletions: 2 }),
			file("bun.lock", { additions: 100, deletions: 100 }),
		],
		patch: {
			text: section("src/x.ts", 3),
			includedFiles: 1,
			omittedFiles: 0,
			truncated: false,
		},
		hasUncommitted: false,
		unpushedCommits: null,
	};

	test("renders branch facts, commits with bodies, the diffstat, and the patch", () => {
		const text = formatPrContext(base);
		expect(text).toContain("Branch: feat/thing");
		expect(text).toContain("Base: main (measured against origin/main)");
		expect(text).toContain("Upstream: none — the branch is not published yet");
		expect(text).toContain("- a1 feat(x): add thing");
		expect(text).toContain("  Closes #12");
		expect(text).toContain("1 generated file marked [generated]");
		expect(text).toContain("- bun.lock  +100 −100 [generated]");
		expect(text).toContain("- src/x.ts  +10 −2\n");
		expect(text).toContain("## Patch (1 file, ");
		expect(text).toContain("```diff\ndiff --git a/src/x.ts");
		expect(text.endsWith("```")).toBe(true);
	});

	test("explains a truncated or omitted patch", () => {
		const truncated = formatPrContext({
			...base,
			hasUncommitted: true,
			unpushedCommits: 2,
			patch: { ...base.patch, omittedFiles: 3, truncated: true },
		});
		expect(truncated).toContain("Uncommitted changes: yes — commit them first");
		expect(truncated).toContain("Upstream: 2 commits not pushed yet");
		expect(truncated).toContain("1 of 4 files");
		expect(truncated).toContain("git diff origin/main...HEAD -- <path>");

		const omitted = formatPrContext({
			...base,
			patch: { text: "", includedFiles: 0, omittedFiles: 5, truncated: true },
		});
		expect(omitted).toContain("## Patch: omitted (too many files");
	});
});
