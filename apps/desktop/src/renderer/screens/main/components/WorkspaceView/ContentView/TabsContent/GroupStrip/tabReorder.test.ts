import { describe, expect, it } from "bun:test";
import { shouldReorderOnHover } from "./tabReorder";

const TAB_WIDTH = 160;

/** Bounding box for the tab at `index`, assuming fixed-width tabs. */
function rectFor(index: number) {
	return { left: index * TAB_WIDTH, right: (index + 1) * TAB_WIDTH };
}

/** Which tab index the pointer is currently over. */
function indexAtPointer(pointerX: number) {
	return Math.floor(pointerX / TAB_WIDTH);
}

/**
 * Replays a sequence of pointer X positions for a tab picked up at
 * `startIndex` and returns how many times a swap was committed, using the
 * supplied decision function. A high swap count for a small back-and-forth
 * jitter is the "can't reorder" oscillation users see.
 */
function countSwaps(
	startIndex: number,
	pointerXs: number[],
	decide: (args: {
		dragIndex: number;
		hoverIndex: number;
		pointerX: number;
		boundingRect: { left: number; right: number };
	}) => boolean,
): number {
	let dragIndex = startIndex;
	let swaps = 0;
	for (const pointerX of pointerXs) {
		const hoverIndex = indexAtPointer(pointerX);
		if (
			decide({
				dragIndex,
				hoverIndex,
				pointerX,
				boundingRect: rectFor(hoverIndex),
			})
		) {
			dragIndex = hoverIndex;
			swaps += 1;
		}
	}
	return swaps;
}

// The legacy behaviour: swap whenever the pointer is over a different tab.
const legacyDecide = ({
	dragIndex,
	hoverIndex,
}: {
	dragIndex: number;
	hoverIndex: number;
}) => dragIndex !== hoverIndex;

describe("tab reorder hover (reproduces #5156)", () => {
	// Pointer hovers right around tab A/B's shared edge (x=160), jittering a few
	// pixels either side — the kind of motion that happens while a user holds a
	// tab steady trying to drop it. Tab A is [0,160], tab B is [160,320].
	const jitterAcrossEdge = [170, 150, 170, 150, 170];

	it("legacy unconditional swap oscillates near a tab boundary", () => {
		// Each crossing of the edge flips the tab back and forth: reordering
		// never settles, so the tab appears impossible to drop where you want.
		const swaps = countSwaps(0, jitterAcrossEdge, legacyDecide);
		expect(swaps).toBeGreaterThan(1);
	});

	it("midpoint guard does not swap until the pointer passes the midpoint", () => {
		// The pointer never crosses tab B's midpoint (240), so nothing moves.
		const swaps = countSwaps(0, jitterAcrossEdge, shouldReorderOnHover);
		expect(swaps).toBe(0);
	});

	it("commits the swap once the pointer crosses the midpoint", () => {
		// Drag tab A (index 0) rightwards past tab B's midpoint.
		expect(
			shouldReorderOnHover({
				dragIndex: 0,
				hoverIndex: 1,
				pointerX: 260, // > midpoint 240 of tab B [160, 320]
				boundingRect: rectFor(1),
			}),
		).toBe(true);
	});

	it("commits a leftward swap once the pointer crosses the midpoint", () => {
		// Drag tab C (index 2) leftwards past tab A's midpoint (80).
		expect(
			shouldReorderOnHover({
				dragIndex: 2,
				hoverIndex: 0,
				pointerX: 40, // < midpoint 80 of tab A [0, 160]
				boundingRect: rectFor(0),
			}),
		).toBe(true);
	});

	it("never swaps a tab with itself", () => {
		expect(
			shouldReorderOnHover({
				dragIndex: 1,
				hoverIndex: 1,
				pointerX: 200,
				boundingRect: rectFor(1),
			}),
		).toBe(false);
	});
});
