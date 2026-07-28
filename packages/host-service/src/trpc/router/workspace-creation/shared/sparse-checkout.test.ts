import { describe, expect, test } from "bun:test";
import {
	addWorktreeWithSparseCheckout,
	normalizeSparseCheckoutPath,
	normalizeSparseCheckoutPaths,
	parseSparseCheckoutPaths,
	serializeSparseCheckoutPaths,
} from "./sparse-checkout";
import type { GitClient } from "./types";

/** Records every `git.raw` argv, failing the ones the test asks it to. */
function fakeGit(failWhen: (argv: string[]) => boolean = () => false) {
	const calls: string[][] = [];
	const git = {
		raw: async (argv: string[]) => {
			calls.push(argv);
			if (failWhen(argv)) throw new Error(`boom: ${argv.join(" ")}`);
			return "";
		},
	} as unknown as GitClient;
	return { git, calls };
}

describe("normalizeSparseCheckoutPath", () => {
	test("keeps a plain repo-relative folder", () => {
		expect(normalizeSparseCheckoutPath("apps/desktop")).toBe("apps/desktop");
	});

	test("strips leading ./ and / and trailing separators", () => {
		expect(normalizeSparseCheckoutPath("./apps/desktop/")).toBe("apps/desktop");
		expect(normalizeSparseCheckoutPath("/packages/ui")).toBe("packages/ui");
		expect(normalizeSparseCheckoutPath(".//apps//")).toBe("apps");
	});

	test("normalizes backslashes and surrounding whitespace", () => {
		expect(normalizeSparseCheckoutPath("  apps\\desktop  ")).toBe(
			"apps/desktop",
		);
	});

	test("returns null for entries that are empty once trimmed", () => {
		expect(normalizeSparseCheckoutPath("")).toBeNull();
		expect(normalizeSparseCheckoutPath("   ")).toBeNull();
		expect(normalizeSparseCheckoutPath("./")).toBeNull();
		expect(normalizeSparseCheckoutPath(".")).toBeNull();
	});

	test("rejects paths that escape the repo root", () => {
		expect(() => normalizeSparseCheckoutPath("../secrets")).toThrow();
		expect(() => normalizeSparseCheckoutPath("apps/../../etc")).toThrow();
	});

	test("allows dots inside a segment", () => {
		expect(normalizeSparseCheckoutPath(".github/workflows")).toBe(
			".github/workflows",
		);
	});
});

describe("normalizeSparseCheckoutPaths", () => {
	test("drops blanks and de-duplicates, preserving order", () => {
		expect(
			normalizeSparseCheckoutPaths([
				"apps/desktop",
				"",
				"  ",
				"./apps/desktop/",
				"packages/ui",
			]),
		).toEqual(["apps/desktop", "packages/ui"]);
	});

	test("rejects more folders than the cap", () => {
		const many = Array.from({ length: 201 }, (_, i) => `pkg/${i}`);
		expect(() => normalizeSparseCheckoutPaths(many)).toThrow();
	});
});

describe("parse/serialize round-trip", () => {
	test("round-trips a list", () => {
		const paths = ["apps/desktop", "packages/ui"];
		expect(
			parseSparseCheckoutPaths(serializeSparseCheckoutPaths(paths)),
		).toEqual(paths);
	});

	test("an empty list stores null, meaning a full checkout", () => {
		expect(serializeSparseCheckoutPaths([])).toBeNull();
		expect(parseSparseCheckoutPaths(null)).toEqual([]);
	});

	test("unreadable column values degrade to a full checkout", () => {
		expect(parseSparseCheckoutPaths("not json")).toEqual([]);
		expect(parseSparseCheckoutPaths('{"a":1}')).toEqual([]);
		expect(parseSparseCheckoutPaths('["apps", 7, null]')).toEqual(["apps"]);
	});
});

describe("addWorktreeWithSparseCheckout", () => {
	const base = { worktreeArgs: ["/wt", "main"], worktreePath: "/wt" };

	test("does a plain add when no folders are configured", async () => {
		const { git, calls } = fakeGit();
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: [],
			logPrefix: "[test]",
		});
		expect(calls).toEqual([["worktree", "add", "/wt", "main"]]);
	});

	test("adds with --no-checkout, sets the cone, then checks out", async () => {
		const { git, calls } = fakeGit();
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: ["apps/desktop"],
			logPrefix: "[test]",
		});
		expect(calls).toEqual([
			["worktree", "add", "--no-checkout", "/wt", "main"],
			["-C", "/wt", "sparse-checkout", "set", "--cone", "--", "apps/desktop"],
			["-C", "/wt", "checkout"],
		]);
	});

	test("falls back to a full checkout when git rejects the patterns", async () => {
		const { git, calls } = fakeGit((argv) => argv.includes("set"));
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: ["apps/desktop"],
			logPrefix: "[test]",
		});
		expect(calls.at(-2)).toEqual(["-C", "/wt", "sparse-checkout", "disable"]);
		expect(calls.at(-1)).toEqual(["-C", "/wt", "checkout"]);
	});

	test("removes the worktree when the checkout itself fails", async () => {
		const { git, calls } = fakeGit((argv) => argv.at(-1) === "checkout");
		await expect(
			addWorktreeWithSparseCheckout({
				...base,
				git,
				sparsePaths: ["apps/desktop"],
				logPrefix: "[test]",
			}),
		).rejects.toThrow();
		// Callers treat a throw as "nothing was created" — so it must not be.
		expect(calls.at(-1)).toEqual(["worktree", "remove", "--force", "/wt"]);
	});
});
