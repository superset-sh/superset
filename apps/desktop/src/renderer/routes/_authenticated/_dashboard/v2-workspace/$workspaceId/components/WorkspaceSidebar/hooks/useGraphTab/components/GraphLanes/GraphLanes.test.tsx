import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GraphEdge, GraphRowModel } from "../../types";
import { graphGeometry } from "./constants";
import { GraphLanes } from "./GraphLanes";

function row(overrides: Partial<GraphRowModel> = {}): GraphRowModel {
	return {
		commit: {
			hash: "aaa",
			shortHash: "aaa0000",
			message: "m",
			author: "Ada",
			authorEmail: "a@x",
			date: "2026-07-31T09:00:00Z",
			parents: ["bbb"],
			refs: [],
		},
		lane: 0,
		color: 1,
		isMerge: false,
		isRoot: false,
		edges: [],
		laneCount: 1,
		...overrides,
	};
}

function render(
	model: GraphRowModel,
	{ compact = false, laneCap = 6, topOffset = 0 } = {},
) {
	return renderToStaticMarkup(
		<GraphLanes
			row={model}
			compact={compact}
			laneCap={laneCap}
			topOffset={topOffset}
		/>,
	);
}

/** Count occurrences of a substring (a tag open + attrs match is enough). */
function count(markup: string, needle: string): number {
	let n = 0;
	let i = markup.indexOf(needle);
	while (i !== -1) {
		n++;
		i = markup.indexOf(needle, i + needle.length);
	}
	return n;
}

describe("GraphLanes", () => {
	it("sizes the SVG to the visible lane count, capped", () => {
		const geo = graphGeometry(false);
		// 3 lanes, cap 6 → all visible.
		expect(render(row({ laneCount: 3 }))).toContain(
			`width="${3 * geo.pitch + 4}"`,
		);
		// 10 lanes, cap 6 → collapsed to 6 visible.
		expect(render(row({ laneCount: 10 }), { laneCap: 6 })).toContain(
			`width="${6 * geo.pitch + 4}"`,
		);
	});

	it("draws one path per edge", () => {
		const edges: GraphEdge[] = [
			{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 },
			{ kind: "out-straight", fromLane: 0, toLane: 0, color: 1 },
		];
		const markup = render(row({ edges, laneCount: 1 }));
		expect(count(markup, "<path")).toBe(edges.length);
	});

	it("stubs an out-stub edge dashed and dimmed", () => {
		const markup = render(
			row({
				edges: [{ kind: "out-stub", fromLane: 0, toLane: 0, color: 1 }],
				laneCount: 1,
			}),
		);
		expect(markup).toContain('stroke-dasharray="2 2"');
		expect(markup).toContain('opacity="0.55"');
	});

	it("renders a donut node for a plain commit, a filled node for merges/roots", () => {
		// Plain commit: one ringed circle (stroke set, no separate fill colour).
		const plain = render(row({ isMerge: false, isRoot: false }));
		expect(count(plain, "<circle")).toBe(1);
		// Merge: filled node.
		const merge = render(row({ isMerge: true }));
		expect(count(merge, "<circle")).toBe(1);
		expect(merge).toContain("var(--graph-lane-1)");
		// Root: filled node plus an outer ring → two circles.
		const root = render(row({ isRoot: true }));
		expect(count(root, "<circle")).toBe(2);
	});

	it("clamps lanes past the cap onto the last visible lane", () => {
		// Node on lane 9 with a cap of 6 lands at the x of lane 5, not lane 9.
		const geo = graphGeometry(false);
		const clampedX = (5 * geo.pitch + geo.pitch / 2).toString();
		const markup = render(row({ lane: 9, laneCount: 10, isRoot: true }), {
			laneCap: 6,
		});
		expect(markup).toContain(`cx="${clampedX}"`);
	});

	it("paints each edge in its own lane colour", () => {
		const markup = render(
			row({
				edges: [
					{ kind: "pass", fromLane: 0, toLane: 0, color: 2 },
					{ kind: "in-merge", fromLane: 1, toLane: 0, color: 3 },
				],
				laneCount: 2,
			}),
		);
		expect(markup).toContain("var(--graph-lane-2)");
		expect(markup).toContain("var(--graph-lane-3)");
	});

	it("emits a recognizable path shape per edge kind", () => {
		// Geometry is the spec contract; assert each kind's path opens where the
		// spec says (incoming from the top y=0, outgoing from the node y=rowHeight/2).
		const geo = graphGeometry(false);
		const yc = (geo.rowHeight / 2).toString();
		const incoming = render(
			row({
				edges: [{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 }],
				laneCount: 1,
			}),
		);
		expect(incoming).toContain(`d="M7,0 V${yc}"`);
		const outgoing = render(
			row({
				edges: [{ kind: "out-straight", fromLane: 0, toLane: 0, color: 1 }],
				laneCount: 1,
			}),
		);
		expect(outgoing).toContain(`d="M7,${yc} V${geo.rowHeight}"`);
		// A pass edge spans the full row height.
		const pass = render(
			row({
				edges: [{ kind: "pass", fromLane: 0, toLane: 0, color: 1 }],
				laneCount: 1,
			}),
		);
		expect(pass).toContain(`d="M7,0 V${geo.rowHeight}"`);
	});

	it("honours compact geometry", () => {
		const geo = graphGeometry(true);
		expect(render(row({ laneCount: 2 }), { compact: true })).toContain(
			`height="${geo.rowHeight}"`,
		);
		// Compact rowHeight (24) is smaller than standard (28).
		expect(geo.rowHeight).toBeLessThan(graphGeometry(false).rowHeight);
	});

	it("pushes the node down by topOffset while lanes still span the row", () => {
		const geo = graphGeometry(false);
		const offset = 16;
		const markup = render(
			row({
				laneCount: 1,
				edges: [
					{ kind: "pass", fromLane: 0, toLane: 0, color: 1 },
					{ kind: "in-straight", fromLane: 0, toLane: 0, color: 1 },
				],
			}),
			{ topOffset: offset },
		);

		const height = geo.rowHeight + offset;
		const yc = offset + geo.rowHeight / 2;

		expect(markup).toContain(`height="${height}"`);
		expect(markup).toContain(`viewBox="0 0 18 ${height}"`);
		// The node tracks the subject line, not the row's midpoint.
		expect(markup).toContain(`cy="${yc}"`);
		expect(markup).not.toContain(`cy="${height / 2}"`);
		// A pass edge still runs edge to edge, so lanes stay continuous.
		expect(markup).toContain(`d="M7,0 V${height}"`);
		// An incoming edge stops at the node, which has moved down with it.
		expect(markup).toContain(`d="M7,0 V${yc}"`);
	});

	it("keeps the out-stub proportional at any row height", () => {
		const geo = graphGeometry(false);
		const stub = {
			kind: "out-stub",
			fromLane: 0,
			toLane: 0,
			color: 1,
		} as const;
		/** 60% of the way from the node down to the bottom edge. */
		const stubEnd = (offset: number) => {
			const height = geo.rowHeight + offset;
			const yc = offset + geo.rowHeight / 2;
			return yc + (height - yc) * 0.6;
		};

		// Single-line: still the original 80%-of-row endpoint.
		expect(stubEnd(0)).toBeCloseTo(geo.rowHeight * 0.8, 6);
		expect(render(row({ edges: [stub], laneCount: 1 }))).toContain(
			`V${stubEnd(0)}"`,
		);

		// Two-line: proportional to the taller row, and still inside it.
		const offset = 16;
		const markup = render(row({ edges: [stub], laneCount: 1 }), {
			topOffset: offset,
		});
		expect(markup).toContain(`V${stubEnd(offset)}"`);
		expect(stubEnd(offset)).toBeLessThan(geo.rowHeight + offset);
	});
});
