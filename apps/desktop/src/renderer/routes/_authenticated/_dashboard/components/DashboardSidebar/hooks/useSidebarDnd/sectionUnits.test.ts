import { describe, expect, test } from "bun:test";
import type { ClientRect } from "@dnd-kit/core";
import {
	buildTopLevelUnits,
	closestUnitCenter,
	createSectionUnitSortingStrategy,
	findUnitIndex,
} from "./sectionUnits";

const isSection = (id: string | number) => String(id).startsWith("sec::");

// Project list: ungrouped row, section A (2 rows), section B (3 rows), row.
const items = [
	"ws::main",
	"sec::a",
	"ws::a1",
	"ws::a2",
	"sec::b",
	"ws::b1",
	"ws::b2",
	"ws::b3",
	"ws::tail",
];
const membership = {
	"ws::a1": "sec::a",
	"ws::a2": "sec::a",
	"ws::b1": "sec::b",
	"ws::b2": "sec::b",
	"ws::b3": "sec::b",
};

const ROW = 28;
function rect(top: number, height = ROW): ClientRect {
	return { top, height, left: 0, width: 200, right: 200, bottom: top + height };
}

/** Every row measured at its resting position (nothing collapses mid-drag). */
function rowRects(): ClientRect[] {
	return items.map((_, index) => rect(index * ROW));
}

describe("buildTopLevelUnits", () => {
	test("groups section rows under their header, ungrouped rows alone", () => {
		const units = buildTopLevelUnits(items, membership, isSection);
		expect(units.map((u) => u.ids)).toEqual([
			["ws::main"],
			["sec::a", "ws::a1", "ws::a2"],
			["sec::b", "ws::b1", "ws::b2", "ws::b3"],
			["ws::tail"],
		]);
		expect(findUnitIndex(units, "ws::b2")).toBe(2);
		expect(findUnitIndex(units, "sec::b")).toBe(2);
		expect(findUnitIndex(units, "nope")).toBe(-1);
	});
});

describe("createSectionUnitSortingStrategy", () => {
	const strategy = createSectionUnitSortingStrategy(
		items,
		membership,
		isSection,
	);
	const rects = rowRects();
	const unitRect = (ids: string[]) => {
		const tops = ids.map((id) => rects[items.indexOf(id)]);
		const top = tops[0].top;
		const bottom = tops[tops.length - 1].bottom;
		return { top, bottom, height: bottom - top };
	};
	const A = unitRect(["sec::a", "ws::a1", "ws::a2"]);
	const B = unitRect(["sec::b", "ws::b1", "ws::b2", "ws::b3"]);

	test("dragging A over B moves B's rows up by A's full height, A's block after B", () => {
		const activeIndex = items.indexOf("sec::a");
		const overIndex = items.indexOf("sec::b");
		const y = (id: string) =>
			strategy({
				activeIndex,
				overIndex,
				index: items.indexOf(id),
				rects,
				activeNodeRect: null,
			})?.y;

		expect(y("ws::main")).toBe(0);
		for (const id of ["sec::b", "ws::b1", "ws::b2", "ws::b3"]) {
			expect(y(id)).toBe(-A.height);
		}
		expect(y("ws::tail")).toBe(0);
		// Header and members travel together to just after B.
		for (const id of ["sec::a", "ws::a1", "ws::a2"]) {
			expect(y(id)).toBe(B.bottom - A.bottom);
		}
	});

	test("dragging B over a member of A moves A's block down, B's block above A", () => {
		const activeIndex = items.indexOf("sec::b");
		const overIndex = items.indexOf("ws::a2");
		const y = (id: string) =>
			strategy({
				activeIndex,
				overIndex,
				index: items.indexOf(id),
				rects,
				activeNodeRect: null,
			})?.y;

		for (const id of ["sec::a", "ws::a1", "ws::a2"]) {
			expect(y(id)).toBe(B.height);
		}
		expect(y("ws::main")).toBe(0);
		expect(y("ws::tail")).toBe(0);
		for (const id of ["sec::b", "ws::b1", "ws::b2", "ws::b3"]) {
			expect(y(id)).toBe(A.top - B.top);
		}
	});

	test("over the active unit itself leaves everything in place", () => {
		const activeIndex = items.indexOf("sec::a");
		for (const id of ["ws::main", "sec::a", "ws::a2", "sec::b", "ws::tail"]) {
			expect(
				strategy({
					activeIndex,
					overIndex: activeIndex,
					index: items.indexOf(id),
					rects,
					activeNodeRect: null,
				})?.y,
			).toBe(0);
		}
	});

	test("rows without a rect (disabled) get no transform", () => {
		const sparse = [...rects];
		sparse[items.indexOf("ws::main")] = undefined as unknown as ClientRect;
		expect(
			strategy({
				activeIndex: items.indexOf("sec::b"),
				overIndex: items.indexOf("ws::main"),
				index: items.indexOf("ws::main"),
				rects: sparse,
				activeNodeRect: null,
			}),
		).toBeNull();
	});
});

describe("closestUnitCenter", () => {
	test("hops to a group only once the ghost crosses the group's center", () => {
		const units = buildTopLevelUnits(items, membership, isSection);
		const rects = rowRects();
		const droppableRects = new Map<string, ClientRect>();
		items.forEach((id, i) => {
			droppableRects.set(id, rects[i]);
		});
		const detect = closestUnitCenter(units);
		const droppableContainers = units.map(
			(unit) => ({ id: unit.key }) as never,
		);
		// The ghost is header-sized; `top` is its position.
		const at = (top: number) =>
			detect({
				collisionRect: rect(top),
				droppableRects,
				active: null as never,
				droppableContainers,
				pointerCoordinates: null,
			})[0]?.id;

		// A spans 28..112 (center 70), B spans 112..224 (center 168).
		expect(at(40)).toBe("sec::a");
		expect(at(100)).toBe("sec::a"); // over B's header row, still nearer A
		expect(at(130)).toBe("sec::b");
		expect(at(230)).toBe("ws::tail");
	});
});
