import { describe, expect, test } from "bun:test";
import {
	buildTipSet,
	classifyRefType,
	parseForEachRef,
	parseGraphLog,
	parseMergedBranches,
	refShortName,
	worktreeByBranch,
} from "./graph-log";

describe("classifyRefType", () => {
	test("classifies heads, tags, remotes, and HEAD", () => {
		expect(classifyRefType("refs/heads/main")).toBe("branch");
		expect(classifyRefType("refs/tags/v1.0")).toBe("tag");
		expect(classifyRefType("refs/remotes/origin/main")).toBe("remote");
		expect(classifyRefType("HEAD")).toBe("head");
	});

	test("returns null for unrecognized refs", () => {
		expect(classifyRefType("refs/stash")).toBeNull();
		expect(classifyRefType("origin/main")).toBeNull();
		expect(classifyRefType("main")).toBeNull();
	});
});

describe("refShortName", () => {
	test("strips known prefixes", () => {
		expect(refShortName("refs/heads/feature/x")).toBe("feature/x");
		expect(refShortName("refs/tags/v1.0")).toBe("v1.0");
		expect(refShortName("refs/remotes/origin/main")).toBe("origin/main");
		expect(refShortName("HEAD")).toBe("HEAD");
	});
});

describe("parseForEachRef", () => {
	test("classifies and drops symbolic remote HEAD", () => {
		const raw = [
			"aaa\trefs/heads/main\trefs/remotes/origin/main",
			"bbb\trefs/heads/feature\t",
			"aaa\trefs/remotes/origin/HEAD\t", // symbolic — dropped
			"aaa\trefs/remotes/origin/main\t",
			"ccc\trefs/tags/v1.0\t",
		].join("\n");
		const refs = parseForEachRef(raw);
		expect(refs).toHaveLength(4);
		expect(
			refs.find((r) => r.fullRef === "refs/remotes/origin/HEAD"),
		).toBeUndefined();
		const main = refs.find((r) => r.fullRef === "refs/heads/main");
		expect(main?.type).toBe("branch");
		expect(main?.upstream).toBe("refs/remotes/origin/main");
		expect(main?.name).toBe("main");
		const tag = refs.find((r) => r.fullRef === "refs/tags/v1.0");
		expect(tag?.type).toBe("tag");
	});

	test("skips blank / malformed lines", () => {
		expect(parseForEachRef("")).toEqual([]);
		expect(parseForEachRef("onlyhash")).toEqual([]);
	});
});

describe("parseGraphLog", () => {
	test("parses 7-field rows and keeps tabs in subject", () => {
		const raw =
			"fullhash\tshort\t<p1> <p2>\tAda\tada@x\t2024-01-02T03:04:05Z\tsubject with\ttab";
		const commits = parseGraphLog(raw);
		expect(commits).toHaveLength(1);
		const c = commits[0];
		if (!c) throw new Error("expected commit");
		expect(c).toMatchObject({
			hash: "fullhash",
			shortHash: "short",
			author: "Ada",
			authorEmail: "ada@x",
			date: "2024-01-02T03:04:05Z",
			message: "subject with\ttab",
		});
		expect(c.parents).toEqual(["<p1>", "<p2>"]);
	});

	test("root commit has empty parents", () => {
		const commits = parseGraphLog("h\tsh\t\tA\ta@x\t2024\tmsg");
		const c = commits[0];
		if (!c) throw new Error("expected commit");
		expect(c.parents).toEqual([]);
	});

	test("skips blank / short rows", () => {
		expect(parseGraphLog("")).toEqual([]);
		expect(parseGraphLog("a\tb")).toEqual([]);
	});
});

describe("parseMergedBranches", () => {
	test("keeps only refs/heads lines", () => {
		const raw = "refs/heads/main\nrefs/heads/merged\n  \nrefs/heads/other";
		expect(parseMergedBranches(raw).sort()).toEqual([
			"refs/heads/main",
			"refs/heads/merged",
			"refs/heads/other",
		]);
	});
});

describe("buildTipSet", () => {
	test("dedupes and always includes head", () => {
		const tips = buildTipSet({
			head: "HEAD",
			baseRef: "refs/heads/main",
			localBranchRefs: ["refs/heads/main", "refs/heads/feature"],
			detachedWorktreeHeads: ["deadbeef"],
			upstreamRefs: ["refs/remotes/origin/main"],
		});
		expect(tips.sort()).toEqual(
			[
				"HEAD",
				"deadbeef",
				"refs/heads/feature",
				"refs/heads/main",
				"refs/remotes/origin/main",
			].sort(),
		);
	});

	test("works with null base and empty sets", () => {
		const tips = buildTipSet({
			head: "HEAD",
			baseRef: null,
			localBranchRefs: [],
			detachedWorktreeHeads: [],
			upstreamRefs: [],
		});
		expect(tips).toEqual(["HEAD"]);
	});

	test("scopes widen from head to all", () => {
		const args = {
			head: "HEAD",
			baseRef: "refs/heads/main",
			localBranchRefs: ["refs/heads/main", "refs/heads/feature"],
			worktreeBranchRefs: ["refs/heads/feature"],
			detachedWorktreeHeads: ["deadbeef"],
			upstreamRefs: ["refs/remotes/origin/feature"],
		};
		expect(buildTipSet({ ...args, scope: "head" })).toEqual(["HEAD"]);
		expect(buildTipSet({ ...args, scope: "open-workspaces" }).sort()).toEqual(
			["HEAD", "deadbeef", "refs/heads/feature", "refs/heads/main"].sort(),
		);
		expect(buildTipSet({ ...args, scope: "local" })).toContain(
			"refs/remotes/origin/feature",
		);
		// `remote` is HEAD + one flag: no local branches, no worktree heads.
		expect(buildTipSet({ ...args, scope: "remote" }).sort()).toEqual(
			["HEAD", "--remotes"].sort(),
		);
		// `all` never enumerates refs — one flag, whatever the tag count.
		expect(buildTipSet({ ...args, scope: "all" }).sort()).toEqual(
			[
				"HEAD",
				"deadbeef",
				"refs/heads/main",
				"--exclude=refs/stash",
				"--all",
			].sort(),
		);
	});
});

describe("worktreeByBranch", () => {
	test("maps non-bare branch worktrees, skips detached/bare", () => {
		const map = worktreeByBranch([
			{
				path: "/a",
				head: "h1",
				branch: "main",
				detached: false,
				bare: false,
				locked: null,
				prunable: null,
			},
			{
				path: "/b",
				head: "h2",
				branch: null,
				detached: true,
				bare: false,
				locked: null,
				prunable: null,
			},
			{
				path: "/c",
				head: null,
				branch: null,
				detached: false,
				bare: true,
				locked: null,
				prunable: null,
			},
			{
				path: "/d",
				head: "h3",
				branch: "feature",
				detached: false,
				bare: false,
				locked: null,
				prunable: null,
			},
		]);
		expect([...map.keys()].sort()).toEqual(["feature", "main"]);
		expect(map.get("main")?.path).toBe("/a");
	});
});
