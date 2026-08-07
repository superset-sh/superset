import { describe, expect, it } from "bun:test";
import type {
	GraphCommit,
	GraphEdge,
	GraphLaneColor,
	GraphRef,
	GraphRowModel,
} from "../../types";
import { assignLanes } from "./assignLanes";

const FULL = "0000000000000000000000000000000000";

/** Pads a short label into a 40-char hash so parent refs match commit hashes. */
const full = (h: string): string => `${h}${FULL}`.slice(0, 40);

function commit(
	hash: string,
	parents: string[],
	refs: GraphRef[] = [],
): GraphCommit {
	return {
		hash: full(hash),
		shortHash: hash.padEnd(7, "0").slice(0, 7),
		message: hash,
		author: "Ada",
		authorEmail: "ada@example.com",
		date: "2026-07-31T09:00:00Z",
		// Parents are padded too, so `present.has(parent)` resolves correctly.
		parents: parents.map(full),
		refs,
	};
}

function branch(name: string): GraphRef {
	return { name, type: "branch", state: null };
}

function kinds(row: GraphRowModel): GraphEdge["kind"][] {
	return row.edges.map((e) => e.kind);
}

/** Geometry snapshot — the computed layout, independent of the commit payload. */
function geometry(row: GraphRowModel) {
	return {
		lane: row.lane,
		color: row.color,
		isMerge: row.isMerge,
		isRoot: row.isRoot,
		laneCount: row.laneCount,
		edges: row.edges,
	};
}

/** Asserts every edge stays inside [0, laneCount), colours are 1..8, keys unique. */
function assertValidRows(rows: GraphRowModel[]): void {
	for (const row of rows) {
		expect(row.lane, "lane inside laneCount").toBeGreaterThanOrEqual(0);
		expect(row.lane, "lane inside laneCount").toBeLessThan(row.laneCount);
		expect(row.color, "colour in 1..8").toBeGreaterThanOrEqual(1);
		expect(row.color, "colour in 1..8").toBeLessThanOrEqual(8);
		const seen = new Set<string>();
		for (const edge of row.edges) {
			expect(edge.color, "edge colour in 1..8").toBeGreaterThanOrEqual(1);
			expect(edge.color, "edge colour in 1..8").toBeLessThanOrEqual(8);
			expect(edge.fromLane, "fromLane inside laneCount").toBeLessThan(
				row.laneCount,
			);
			expect(edge.toLane, "toLane inside laneCount").toBeLessThan(
				row.laneCount,
			);
			const key = `${edge.kind}-${edge.fromLane}-${edge.toLane}`;
			expect(seen.has(key), `duplicate edge key ${key}`).toBe(false);
			seen.add(key);
		}
	}
}

function findRow(rows: GraphRowModel[], hash: string): GraphRowModel {
	const row = rows.find((r) => r.commit.hash.startsWith(hash));
	if (!row) throw new Error(`no row for ${hash}`);
	return row;
}

describe("assignLanes", () => {
	it("lays a linear chain on one lane with straight edges", () => {
		const c = commit("c", ["b"], [branch("main")]);
		const b = commit("b", ["a"]);
		const a = commit("a", []);
		const rows = assignLanes([c, b, a]);

		assertValidRows(rows);
		expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
		// The tip opens its lane here — nothing above it, so no incoming edge.
		expect(kinds(rows[0])).toEqual(["out-straight"]);
		expect(kinds(rows[1])).toEqual(["in-straight", "out-straight"]);
		expect(kinds(rows[2])).toEqual(["in-straight"]); // root: no outgoing edge
		expect(rows[2].isRoot).toBe(true);
		// Colour seeded once from the tip's branch and inherited downwards.
		const color = rows[0].color;
		expect(rows.map((r) => r.color)).toEqual([color, color, color]);
	});

	it("forks an extra parent into its own lane on a simple merge", () => {
		const m = commit("m", ["a", "b"], [branch("main")]);
		const a = commit("a", ["r"]);
		const b = commit("b", ["r"]);
		const r = commit("r", []);
		const rows = assignLanes([m, a, b, r]);

		assertValidRows(rows);
		const mRow = findRow(rows, "m");
		const bRow = findRow(rows, "b");
		const rRow = findRow(rows, "r");

		expect(mRow.isMerge).toBe(true);
		expect(mRow.lane).toBe(0);
		// First parent straight, second parent forks into a new lane.
		expect(mRow.edges).toContainEqual({
			kind: "out-straight",
			fromLane: 0,
			toLane: 0,
			color: mRow.color,
		});
		const fork = mRow.edges.find((e) => e.kind === "out-fork");
		if (!fork)
			throw new Error("expected an out-fork edge to the second parent");
		expect(fork.fromLane).toBe(0);
		expect(fork.toLane).toBeGreaterThan(0);
		expect(bRow.lane).toBe(fork.toLane);

		// Root: one lane is its own (in-straight), the other merges in.
		const mergesIntoRoot = rRow.edges.filter((e) => e.kind === "in-merge");
		expect(mergesIntoRoot.length, "one lane converges via in-merge").toBe(1);
		expect(mergesIntoRoot[0].toLane).toBe(rRow.lane);
		expect(rRow.laneCount, "both lanes visible at the root").toBe(2);
	});

	it("emits one out-fork per extra parent on an octopus merge", () => {
		const o = commit("o", ["a", "b", "c"], [branch("main")]);
		const a = commit("a", ["r"]);
		const b = commit("b", ["r"]);
		const c = commit("c", ["r"]);
		const r = commit("r", []);
		const rows = assignLanes([o, a, b, c, r]);

		assertValidRows(rows);
		const octopus = findRow(rows, "o");
		expect(octopus.isMerge).toBe(true);
		expect(octopus.edges.filter((e) => e.kind === "out-straight").length).toBe(
			1,
		);
		const forks = octopus.edges.filter((e) => e.kind === "out-fork");
		expect(forks.length, "two out-fork edges for the two extra parents").toBe(
			2,
		);
		expect(
			new Set(forks.map((f) => f.toLane)).size,
			"each extra parent gets its own lane",
		).toBe(2);
	});

	it("survives a criss-cross without invalid lanes or duplicate edges", () => {
		// Two merges over the same pair of branches — the classic hard case.
		const r = commit("r", []);
		const a = commit("a", ["r"]);
		const b = commit("b", ["r"]);
		const m1 = commit("m1", ["a", "b"], [branch("feature")]);
		const m2 = commit("m2", ["a", "b"], [branch("release")]);
		const rows = assignLanes([m1, m2, a, b, r]);

		assertValidRows(rows);
		const mergeRows = rows.filter((row) => row.isMerge);
		expect(mergeRows.length).toBe(2);
		// Each merge forks its second parent out, regardless of lane reuse above.
		for (const mergeRow of mergeRows) {
			expect(mergeRow.edges.filter((e) => e.kind === "out-fork").length).toBe(
				1,
			);
		}
		expect(findRow(rows, "r").isRoot).toBe(true);
	});

	it("marks a parentless commit as a root and frees its lane", () => {
		const a = commit("a", [], [branch("main")]);
		const rows = assignLanes([a]);

		assertValidRows(rows);
		expect(rows[0].isRoot).toBe(true);
		// A lone tip-and-root: nothing above to come from, nothing below to go to.
		expect(kinds(rows[0])).toEqual([]);
	});

	it("emits no incoming edge for a branch tip", () => {
		// Two tips over a shared trunk: c is the graph tip (main), f is a
		// dangling branch tip (feature). Both open their lane at the top, so
		// neither has anything above it to draw an incoming edge from. b,
		// reached by both, still gets its incoming edges — proving the
		// suppression is specific to lanes opened in their own row.
		const c = commit("c", ["b"], [branch("main")]);
		const f = commit("f", ["b"], [branch("feature")]);
		const b = commit("b", ["a"]);
		const a = commit("a", []);
		const rows = assignLanes([c, f, b, a]);

		assertValidRows(rows);
		const cRow = findRow(rows, "c");
		const fRow = findRow(rows, "f");
		const bRow = findRow(rows, "b");

		const incoming = (row: GraphRowModel) =>
			row.edges.filter(
				(e) => e.kind === "in-straight" || e.kind === "in-merge",
			);
		expect(incoming(cRow), "graph tip has no incoming edge").toEqual([]);
		expect(incoming(fRow), "dangling tip has no incoming edge").toEqual([]);
		// b is reached by both tips: one lane continues straight in, the other
		// merges into the node.
		expect(bRow.edges.filter((e) => e.kind === "in-straight").length).toBe(1);
		expect(bRow.edges.filter((e) => e.kind === "in-merge").length).toBe(1);
	});

	it("reuses a lane freed by a stub for the next unrelated commit", () => {
		// 'a' stubs off (parent outside the window), freeing lane 0. 'b' is an
		// unrelated root that should claim the same slot.
		const a = commit("a", ["outside"], [branch("main")]);
		const b = commit("b", [], [branch("other")]);
		const rows = assignLanes([a, b]);

		assertValidRows(rows);
		expect(kinds(rows[0])).toContain("out-stub");
		expect(rows[1].lane, "freed lane reused").toBe(0);
		expect(rows[1].isRoot).toBe(true);
	});

	it("stubs a first parent that falls outside the window without throwing", () => {
		const a = commit("a", ["not-present"], [branch("main")]);
		const rows = assignLanes([a]);

		assertValidRows(rows);
		expect(kinds(rows[0])).toEqual(["out-stub"]);
		expect(rows[0].laneCount).toBe(1);
	});

	it("stubs a forked extra parent outside the window and frees its lane", () => {
		const m = commit("m", ["a", "gone"], [branch("main")]);
		const a = commit("a", [], [branch("topic")]);
		const rows = assignLanes([m, a]);

		assertValidRows(rows);
		const mRow = findRow(rows, "m");
		const forks = mRow.edges.filter((e) => e.kind === "out-fork");
		expect(forks.length, "one fork to the absent second parent").toBe(1);
		// The absent parent's lane must not linger: the root 'a' reclaims lane 0.
		expect(findRow(rows, "a").lane).toBe(0);
		expect(findRow(rows, "a").laneCount).toBe(1);
	});

	it("keeps older rows geometrically stable when a new tip is prepended", () => {
		// Realistic growth: the branch ref rides the newest commit, so the lane
		// colour stays put as history extends. Older rows must not reflow.
		const base = assignLanes([
			commit("c", ["b"], [branch("main")]),
			commit("b", ["a"]),
			commit("a", []),
		]);
		const grown = assignLanes([
			commit("t", ["c"], [branch("main")]), // new tip takes the ref
			commit("c", ["b"], []), // ref moved up, as git update-ref would do
			commit("b", ["a"]),
			commit("a", []),
		]);

		expect(grown.length).toBe(base.length + 1);
		// b and a are reached by the same parent as before, so their geometry —
		// incoming edges included — is byte-identical.
		expect(geometry(grown[2])).toEqual(geometry(base[1]));
		expect(geometry(grown[3])).toEqual(geometry(base[2]));
		// c was the tip in `base` (no incoming edge). Prepending t makes c a
		// non-tip, so it gains exactly the incoming straight edge from t — the
		// one legitimate change. Lane, colour and outgoing edges stay put.
		const stable = (row: GraphRowModel) => ({
			lane: row.lane,
			color: row.color,
			isMerge: row.isMerge,
			isRoot: row.isRoot,
			laneCount: row.laneCount,
			outgoing: row.edges.filter((e) => e.kind.startsWith("out-")),
		});
		expect(stable(grown[1])).toEqual(stable(base[0]));
		expect(
			grown[1].edges.some((e) => e.kind === "in-straight"),
			"former tip gains an incoming edge once a parent appears above it",
		).toBe(true);
		expect(
			base[0].edges.some((e) => e.kind === "in-straight"),
			"tip has no incoming edge",
		).toBe(false);
	});

	it("is deterministic: the same input yields the same output", () => {
		const a = commit("a", []);
		const b = commit("b", ["a"]);
		const m = commit("m", ["a", "b"], [branch("main")]);
		const once = assignLanes([m, a, b]);
		const twice = assignLanes([m, a, b]);
		expect(once).toEqual(twice);
	});

	it("clamps every emitted colour into the 1..8 palette", () => {
		// A fan-out heavy enough to exercise many distinct fork seeds.
		const tips = Array.from({ length: 8 }, (_, i) =>
			commit(`tip${i}`, ["root"], [branch(`b${i}`)]),
		);
		const root = commit("root", []);
		const rows = assignLanes([...tips, root]);

		assertValidRows(rows);
		const palette: GraphLaneColor[] = [1, 2, 3, 4, 5, 6, 7, 8];
		for (const row of rows) {
			expect(palette).toContain(row.color);
			for (const edge of row.edges) {
				expect(palette).toContain(edge.color);
			}
		}
	});

	it("gives parallel lanes distinct colours up to the palette size", () => {
		// N independent branches over a shared root. Every parent row carries
		// N lanes live at once (the row's own lane plus N-1 `pass` lanes), which
		// is the measured defect: two vertical lines side by side painted the
		// same colour. Up to GRAPH_LANE_COUNT (8) the colours must all differ;
		// only past the palette size may a collision appear, and it must.
		const GRAPH_LANE_COUNT = 8;

		const fan = (n: number): GraphRowModel[] => {
			const tips = Array.from({ length: n }, (_, i) =>
				commit(`t${i}`, [`p${i}`], [branch(`b${i}`)]),
			);
			const parents = Array.from({ length: n }, (_, i) =>
				commit(`p${i}`, ["root"]),
			);
			const root = commit("root", []);
			return assignLanes([...tips, ...parents, root]);
		};

		// Colours running side-by-side at a row: the row's own lane plus every
		// `pass` lane (a vertical line crossing the row untouched).
		const parallelColours = (row: GraphRowModel): number[] => [
			row.color,
			...row.edges.filter((e) => e.kind === "pass").map((e) => e.color),
		];

		// Within the palette: no row paints two parallel lanes the same colour.
		// Sanity-check first that the fixture really is N-wide at its busiest row.
		const within = fan(GRAPH_LANE_COUNT);
		assertValidRows(within);
		const widest = Math.max(
			...within.map((row) => parallelColours(row).length),
		);
		expect(widest, "fixture exercises GRAPH_LANE_COUNT concurrent lanes").toBe(
			GRAPH_LANE_COUNT,
		);
		for (const row of within) {
			const cols = parallelColours(row);
			expect(
				new Set(cols).size,
				`row ${row.commit.shortHash}: parallel lanes must not share a colour`,
			).toBe(cols.length);
		}

		// Past the palette: one more lane than colours forces a collision — the
		// honest ceiling the plan calls out. The duplicate appears only because
		// there is no ninth hue, never because the picker skipped a free slot.
		const beyond = fan(GRAPH_LANE_COUNT + 1);
		assertValidRows(beyond);
		const collisionRow = beyond.find((row) => {
			const cols = parallelColours(row);
			return new Set(cols).size !== cols.length;
		});
		expect(
			collisionRow,
			"a collision appears only once the palette is exhausted",
		).toBeDefined();
	});
});
