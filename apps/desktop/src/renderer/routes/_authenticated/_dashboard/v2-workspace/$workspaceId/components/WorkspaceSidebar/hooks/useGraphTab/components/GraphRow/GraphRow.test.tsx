import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GraphCommit, GraphRef, GraphRowModel } from "../../types";
import { graphRowHeight, laneCapForWidth } from "../GraphLanes";
import { GraphRow } from "./GraphRow";

function commit(
	hash: string,
	parents: string[],
	refs: GraphRef[] = [],
): GraphCommit {
	return {
		hash: `${hash}0000000000000000000000000000000000`.slice(0, 40),
		shortHash: hash.padEnd(7, "0").slice(0, 7),
		message: `feat(desktop): ${hash} subject that is long enough to need truncating`,
		author: "Ada",
		authorEmail: "ada@example.com",
		date: "2026-07-31T09:00:00Z",
		parents,
		refs,
	};
}

function row(overrides: Partial<GraphRowModel> = {}): GraphRowModel {
	return {
		commit: commit("aaa", ["bbb"]),
		lane: 0,
		color: 1,
		isMerge: false,
		isRoot: false,
		edges: [
			{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 },
			{ kind: "out-straight", fromLane: 0, toLane: 0, color: 1 },
		],
		laneCount: 1,
		...overrides,
	};
}

const ALL_STATES: GraphRef[] = [
	{ name: "HEAD", type: "head", state: null },
	{ name: "main", type: "branch", state: "open", worktreeWorkspaceId: "ws_1" },
	{
		name: "feat/share-skills",
		type: "branch",
		state: "detached-worktree",
		worktreePath: "/tmp/wt/share-skills",
	},
	{ name: "chore/turbo", type: "branch", state: "orphan-branch" },
	{
		name: "fix/pty-flake",
		type: "branch",
		state: "prunable",
		pruneReason: "worktree path is gone",
	},
	{ name: "docs/release", type: "branch", state: "merged" },
	{ name: "origin/main", type: "remote", state: null },
	{ name: "v0.9.2", type: "tag", state: null },
];

function render(
	model: GraphRowModel,
	width: number,
	selected = false,
	{ twoLineRefs = false, inRange = false } = {},
) {
	const compact = width < 260;
	return renderToStaticMarkup(
		<GraphRow
			row={model}
			compact={compact}
			selected={selected}
			onSelect={() => {}}
			laneCap={laneCapForWidth(width)}
			showDate={width >= 400}
			twoLineRefs={twoLineRefs}
			inRange={inRange}
		/>,
	);
}

const WIDTHS = [240, 260, 320, 400];

describe("GraphRow", () => {
	it("renders every topology at every breakpoint without NaN geometry", () => {
		const models = [
			row(),
			row({ commit: commit("mmm", ["p1", "p2"]), isMerge: true, laneCount: 2 }),
			row({
				commit: commit("ooo", ["p1", "p2", "p3"]),
				isMerge: true,
				laneCount: 4,
				edges: [
					{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 },
					{ kind: "out-straight", fromLane: 0, toLane: 0, color: 1 },
					{ kind: "out-fork", fromLane: 0, toLane: 1, color: 2 },
					{ kind: "out-fork", fromLane: 0, toLane: 2, color: 3 },
				],
			}),
			row({
				commit: commit("rrr", []),
				isRoot: true,
				edges: [{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 }],
			}),
			row({
				commit: commit("sss", ["outside-the-window"]),
				edges: [
					{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 },
					{ kind: "out-stub", fromLane: 0, toLane: 0, color: 1 },
				],
			}),
			row({
				commit: commit("ccc", ["p1"]),
				lane: 2,
				color: 4,
				laneCount: 3,
				edges: [
					{ kind: "pass", fromLane: 0, toLane: 0, color: 1 },
					{ kind: "pass", fromLane: 1, toLane: 1, color: 2 },
					{ kind: "in-merge", fromLane: 2, toLane: 0, color: 4 },
				],
			}),
		];

		for (const width of WIDTHS) {
			for (const model of models) {
				const markup = render(model, width);
				expect(markup).not.toContain("NaN");
				expect(markup).not.toContain("undefined");
				expect(markup).toContain("<svg");
			}
		}
	});

	it("shows every ref state, ordering HEAD first and collapsing the rest", () => {
		const markup = render(
			row({ commit: commit("aaa", ["bbb"], ALL_STATES) }),
			320,
		);

		// HEAD, then the open branch, then the detached worktree — the rest collapse.
		expect(markup.indexOf("HEAD")).toBeLessThan(markup.indexOf("main"));
		expect(markup.indexOf("main")).toBeLessThan(
			markup.indexOf("feat/share-skills"),
		);
		expect(markup).toContain("+5");
		// The collapsed names stay reachable through the chip's tooltip.
		expect(markup).toContain("fix/pty-flake");
		expect(markup).toContain("v0.9.2");
	});

	it("puts the prune reason in the badge tooltip", () => {
		const markup = render(
			row({
				commit: commit("aaa", ["bbb"], [ALL_STATES[4] as GraphRef]),
			}),
			320,
		);
		expect(markup).toContain("fix/pty-flake — worktree path is gone");
		expect(markup).toContain("line-through");
	});

	it("drops the hash in compact and the date below the wide breakpoint", () => {
		const model = row();
		expect(render(model, 240)).not.toContain(model.commit.shortHash);
		expect(render(model, 320)).toContain(model.commit.shortHash);
		expect(render(model, 320)).not.toContain("min-w-10");
		expect(render(model, 400)).toContain("min-w-10");
	});

	it("caps visible lanes by width and reports the overflow", () => {
		const wide = row({ lane: 0, laneCount: 9 });
		expect(render(wide, 260)).toContain("+3"); // cap 6
		expect(render(wide, 400)).toContain("+1"); // cap 8
		expect(render(wide, 240)).toContain("+5"); // cap 4
	});

	it("marks the selected row with a lane-coloured rail", () => {
		const markup = render(row({ color: 5 }), 320, true);
		expect(markup).toContain("bg-accent");
		expect(markup).toContain("var(--graph-lane-5)");
	});

	it("keeps a selected endpoint brighter than the range band it anchors", () => {
		// resolveRowSelection puts endpoints in selectedSet only (the band is
		// lo+1..hi-1), so equal alphas + --accent is what keeps the ordering.
		const plain = render(row(), 320);
		const band = render(row(), 320, false, { inRange: true });
		const endpoint = render(row(), 320, true);

		expect(plain).toContain("9%, transparent");
		expect(band).toContain("16%, transparent");
		expect(endpoint).toContain("16%, transparent");
		// Anchored on the class boundary: hover:bg-accent is on every row.
		const bgAccent = /[\s"]bg-accent[\s"]/;
		expect(endpoint).toMatch(bgAccent);
		expect(band).not.toMatch(bgAccent);
	});

	describe("two-line ref rows", () => {
		const withRefs = row({ commit: commit("aaa", ["bbb"], ALL_STATES) });

		it("shows every badge untruncated instead of collapsing to a chip", () => {
			const markup = render(withRefs, 320, false, { twoLineRefs: true });

			for (const graphRef of ALL_STATES) {
				expect(markup).toContain(graphRef.name);
			}
			// No "+N" ref chip, and no width cap on the badges.
			expect(markup).not.toContain("+5");
			expect(markup).not.toContain("max-w-[12ch]");
		});

		it("only grows the rows that carry refs", () => {
			const bare = render(row(), 320, false, { twoLineRefs: true });
			const decorated = render(withRefs, 320, false, { twoLineRefs: true });

			expect(bare).toContain(
				`height:${graphRowHeight({ compact: false, twoLine: false })}px`,
			);
			expect(decorated).toContain(
				`height:${graphRowHeight({ compact: false, twoLine: true })}px`,
			);
			// The height the virtualizer would reserve is the height rendered.
			expect(graphRowHeight({ compact: false, twoLine: true })).toBe(44);
		});

		it("changes nothing when the toggle is off", () => {
			expect(render(withRefs, 320)).toBe(render(withRefs, 320, false, {}));
			expect(render(withRefs, 320)).toContain("+5");
			expect(render(withRefs, 320)).toContain("max-w-[12ch]");
		});

		it("keeps the lane SVG spanning the taller row", () => {
			const markup = render(withRefs, 320, false, { twoLineRefs: true });
			expect(markup).toContain(
				`height="${graphRowHeight({ compact: false, twoLine: true })}"`,
			);
		});

		it("uses the compact badge line at the compact breakpoint", () => {
			const markup = render(withRefs, 240, false, { twoLineRefs: true });
			expect(markup).toContain(
				`height:${graphRowHeight({ compact: true, twoLine: true })}px`,
			);
			expect(markup).not.toContain("max-w-[8ch]");
		});
	});
});
