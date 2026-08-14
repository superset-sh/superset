import { describe, expect, test } from "bun:test";
import { graphRowHeight } from "../GraphLanes";
import {
	type GraphSelection,
	graphRowSizer,
	hasUnreferencedRef,
	isTwoLineRow,
	resolveRowSelection,
} from "./GraphTabContent";

// Short hashes are enough — the resolver only compares strings.
const H = ["a", "b", "c", "d", "e", "f"];

const none: GraphSelection = { kind: "none" };
const commit = (hash: string): GraphSelection => ({ kind: "commit", hash });
const range = (fromHash: string, toHash: string): GraphSelection => ({
	kind: "range",
	fromHash,
	toHash,
});

describe("resolveRowSelection", () => {
	test("none highlights nothing", () => {
		const { selectedSet, inRangeSet } = resolveRowSelection(none, H);
		expect(selectedSet.size).toBe(0);
		expect(inRangeSet.size).toBe(0);
	});

	test("commit selects exactly that row, with no range wash", () => {
		const { selectedSet, inRangeSet } = resolveRowSelection(commit("c"), H);
		expect([...selectedSet]).toEqual(["c"]);
		expect(inRangeSet.size).toBe(0);
	});

	test("commit outside the window highlights no row", () => {
		const { selectedSet, inRangeSet } = resolveRowSelection(commit("zzz"), H);
		// The hash is still recorded — harmless, since no rendered row matches
		// it — and no row in the window is marked.
		expect([...selectedSet]).toEqual(["zzz"]);
		expect(H.some((hash) => selectedSet.has(hash))).toBe(false);
		expect(inRangeSet.size).toBe(0);
	});

	test("range highlights both endpoints and the rows between", () => {
		// a(0) b(1) c(2) d(3) e(4) f(5) — range a..d covers b, c in between
		const { selectedSet, inRangeSet } = resolveRowSelection(range("a", "d"), H);
		expect([...selectedSet].sort()).toEqual(["a", "d"]);
		expect([...inRangeSet].sort()).toEqual(["b", "c"]);
	});

	test("range works when endpoints are given in reverse display order", () => {
		// newer-first list; toHash may be the higher index. d(3)..a(0)
		const { selectedSet, inRangeSet } = resolveRowSelection(range("d", "a"), H);
		expect([...selectedSet].sort()).toEqual(["a", "d"]);
		expect([...inRangeSet].sort()).toEqual(["b", "c"]);
	});

	test("adjacent range endpoints select both with nothing between", () => {
		const { selectedSet, inRangeSet } = resolveRowSelection(range("c", "d"), H);
		expect([...selectedSet].sort()).toEqual(["c", "d"]);
		expect(inRangeSet.size).toBe(0);
	});

	test("range with one endpoint outside the window selects only the present one", () => {
		// fromHash "a" present, toHash "zzz" absent → no between-rows computable
		const { selectedSet, inRangeSet } = resolveRowSelection(
			range("a", "zzz"),
			H,
		);
		expect([...selectedSet]).toEqual(["a"]);
		expect(inRangeSet.size).toBe(0);
	});

	test("range with neither endpoint present selects nothing", () => {
		const { selectedSet, inRangeSet } = resolveRowSelection(range("x", "z"), H);
		expect(selectedSet.size).toBe(0);
		expect(inRangeSet.size).toBe(0);
	});
});

describe("isTwoLineRow (§4.2 estimateSize rule)", () => {
	const refs = (n: number) =>
		Array.from({ length: n }, () => ({ state: "open" as string | null }));

	test("toggle off is always single-line, even with refs", () => {
		expect(isTwoLineRow(refs(3), false)).toBe(false);
	});

	test("toggle on only lifts rows that actually carry refs", () => {
		expect(isTwoLineRow([], true)).toBe(false);
		expect(isTwoLineRow(refs(1), true)).toBe(true);
		expect(isTwoLineRow(refs(3), true)).toBe(true);
	});

	test("the taller height applies only to ref-carrying rows", () => {
		// estimateSize feeds isTwoLineRow into graphRowHeight; a ref-less row must
		// stay at base height, a ref-carrying row must grow.
		const base = graphRowHeight({ compact: false, twoLine: false });
		const tall = graphRowHeight({ compact: false, twoLine: true });
		expect(
			graphRowHeight({ compact: false, twoLine: isTwoLineRow([], true) }),
		).toBe(base);
		expect(
			graphRowHeight({
				compact: false,
				twoLine: isTwoLineRow(refs(1), true),
			}),
		).toBe(tall);
		expect(tall).toBeGreaterThan(base);
	});
});

describe("hasUnreferencedRef (§4.3 predicate)", () => {
	const ref = (state: string | null) => ({ state });

	test("a commit whose only ref is merged is referenced (dims under the filter)", () => {
		expect(hasUnreferencedRef([ref("merged")])).toBe(false);
	});

	test("a commit carrying a prunable / orphan / detached-worktree ref is unreferenced (stays bright)", () => {
		expect(hasUnreferencedRef([ref("prunable")])).toBe(true);
		expect(hasUnreferencedRef([ref("orphan-branch")])).toBe(true);
		expect(hasUnreferencedRef([ref("detached-worktree")])).toBe(true);
	});

	test("an open ref anchors the commit", () => {
		expect(hasUnreferencedRef([ref("open")])).toBe(false);
	});

	test("null-state refs (HEAD / remote / tag) never count as a reference", () => {
		expect(hasUnreferencedRef([ref(null)])).toBe(false);
		expect(hasUnreferencedRef([])).toBe(false);
	});
});

describe("graphRowSizer", () => {
	const row = (hash: string, refs: Array<{ state: string | null }>) => ({
		commit: { hash, refs },
	});

	test("getItemKey(i) returns the hash at i", () => {
		const rows = [row("a", []), row("b", [{ state: "open" }]), row("c", [])];
		const sizer = graphRowSizer(rows, { compact: false, twoLineRefs: true });
		expect(sizer.getItemKey(0)).toBe("a");
		expect(sizer.getItemKey(1)).toBe("b");
		expect(sizer.getItemKey(2)).toBe("c");
	});

	test("the shift invariant: a commit's (key, size) survives a prepend", () => {
		// Heights differ across these rows: "b" and "d" carry a ref (two-line),
		// "a" and "c" don't (single-line).
		const before = [
			row("a", []),
			row("b", [{ state: null }]),
			row("c", []),
			row("d", [{ state: "open" }]),
		];
		const sizerBefore = graphRowSizer(before, {
			compact: false,
			twoLineRefs: true,
		});
		const snapshotBefore = new Map(
			before.map((r, i) => [
				r.commit.hash,
				[sizerBefore.getItemKey(i), sizerBefore.estimateSize(i)] as const,
			]),
		);

		// A refetch prepends a brand-new commit, shifting every prior commit's
		// index by one.
		const after = [row("new", []), ...before];
		const sizerAfter = graphRowSizer(after, {
			compact: false,
			twoLineRefs: true,
		});
		const snapshotAfter = new Map(
			after.map((r, i) => [
				r.commit.hash,
				[sizerAfter.getItemKey(i), sizerAfter.estimateSize(i)] as const,
			]),
		);

		// Every commit present in both lists must keep the same (key, size) pair
		// — looked up by its own hash, not by the slot it happens to occupy.
		for (const [hash, pair] of snapshotBefore) {
			expect(snapshotAfter.get(hash)).toEqual(pair);
		}
	});

	test("estimateSize matches graphRowHeight(isTwoLineRow(...)) for both flags", () => {
		const withRef = row("x", [{ state: "open" }]);
		const withoutRef = row("y", []);
		const rows = [withRef, withoutRef];

		for (const compact of [false, true]) {
			for (const twoLineRefs of [false, true]) {
				const sizer = graphRowSizer(rows, { compact, twoLineRefs });
				expect(sizer.estimateSize(0)).toBe(
					graphRowHeight({
						compact,
						twoLine: isTwoLineRow(withRef.commit.refs, twoLineRefs),
					}),
				);
				expect(sizer.estimateSize(1)).toBe(
					graphRowHeight({
						compact,
						twoLine: isTwoLineRow(withoutRef.commit.refs, twoLineRefs),
					}),
				);
			}
		}
	});
});
