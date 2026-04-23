import { describe, expect, test } from "bun:test";
import { computeNormalizedOrders } from "./normalize";

const project = "p-1";

function workspace(
	id: string,
	tabOrder: number,
	sectionId: string | null = null,
	projectId: string = project,
) {
	return { id, projectId, sectionId, tabOrder };
}

function section(id: string, tabOrder: number, projectId: string = project) {
	return { id, projectId, tabOrder };
}

describe("computeNormalizedOrders", () => {
	test("empty input returns empty maps", () => {
		const result = computeNormalizedOrders({ workspaces: [], sections: [] });
		expect(result.workspaceTabOrder.size).toBe(0);
		expect(result.sectionTabOrder.size).toBe(0);
	});

	test("top-level workspaces only — preserve relative order", () => {
		const { workspaceTabOrder } = computeNormalizedOrders({
			workspaces: [workspace("a", 5), workspace("b", 2), workspace("c", 9)],
			sections: [],
		});
		expect(workspaceTabOrder.get("b")).toBe(0);
		expect(workspaceTabOrder.get("a")).toBe(1);
		expect(workspaceTabOrder.get("c")).toBe(2);
	});

	test("sections only — preserve relative order", () => {
		const { sectionTabOrder } = computeNormalizedOrders({
			workspaces: [],
			sections: [section("s1", 10), section("s2", 3)],
		});
		expect(sectionTabOrder.get("s2")).toBe(0);
		expect(sectionTabOrder.get("s1")).toBe(1);
	});

	test("workspaces placed before sections in combined space", () => {
		const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
			workspaces: [workspace("a", 0), workspace("b", 1)],
			sections: [section("s1", 2)],
		});
		expect(workspaceTabOrder.get("a")).toBe(0);
		expect(workspaceTabOrder.get("b")).toBe(1);
		expect(sectionTabOrder.get("s1")).toBe(2);
	});

	test("interleaved v1 layout flattens to workspaces-then-sections", () => {
		// v1: [Section A (0), Workspace X (1), Section B (2), Workspace Y (3)]
		const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
			workspaces: [workspace("X", 1), workspace("Y", 3)],
			sections: [section("A", 0), section("B", 2)],
		});
		// Top-level workspaces first: X (was 1), Y (was 3) → 0, 1
		expect(workspaceTabOrder.get("X")).toBe(0);
		expect(workspaceTabOrder.get("Y")).toBe(1);
		// Sections after: A (was 0), B (was 2) → 2, 3
		expect(sectionTabOrder.get("A")).toBe(2);
		expect(sectionTabOrder.get("B")).toBe(3);
	});

	test("workspaces inside a section keep within-section order", () => {
		const { workspaceTabOrder } = computeNormalizedOrders({
			workspaces: [
				workspace("inner-a", 5, "sec-1"),
				workspace("inner-b", 1, "sec-1"),
				workspace("inner-c", 3, "sec-1"),
			],
			sections: [section("sec-1", 0)],
		});
		expect(workspaceTabOrder.get("inner-b")).toBe(0);
		expect(workspaceTabOrder.get("inner-c")).toBe(1);
		expect(workspaceTabOrder.get("inner-a")).toBe(2);
	});

	test("mixed top-level + in-section workspaces are independent", () => {
		const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
			workspaces: [
				workspace("top-1", 0),
				workspace("top-2", 1),
				workspace("in-a", 7, "sec-1"),
				workspace("in-b", 2, "sec-1"),
			],
			sections: [section("sec-1", 5)],
		});
		// Top-level: top-1=0, top-2=1
		expect(workspaceTabOrder.get("top-1")).toBe(0);
		expect(workspaceTabOrder.get("top-2")).toBe(1);
		// Section tabOrder = 2 (after the 2 top-level workspaces)
		expect(sectionTabOrder.get("sec-1")).toBe(2);
		// In-section: in-b (v1 tabOrder=2) before in-a (v1 tabOrder=7)
		expect(workspaceTabOrder.get("in-b")).toBe(0);
		expect(workspaceTabOrder.get("in-a")).toBe(1);
	});

	test("multiple projects are independent", () => {
		const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
			workspaces: [
				workspace("p1-w1", 0, null, "p1"),
				workspace("p2-w1", 0, null, "p2"),
			],
			sections: [section("p1-sec", 1, "p1"), section("p2-sec", 1, "p2")],
		});
		expect(workspaceTabOrder.get("p1-w1")).toBe(0);
		expect(sectionTabOrder.get("p1-sec")).toBe(1);
		expect(workspaceTabOrder.get("p2-w1")).toBe(0);
		expect(sectionTabOrder.get("p2-sec")).toBe(1);
	});

	test("sparse/gapped v1 values still produce contiguous output", () => {
		const { workspaceTabOrder, sectionTabOrder } = computeNormalizedOrders({
			workspaces: [workspace("a", 0), workspace("b", 100), workspace("c", 250)],
			sections: [section("s1", 500)],
		});
		expect(workspaceTabOrder.get("a")).toBe(0);
		expect(workspaceTabOrder.get("b")).toBe(1);
		expect(workspaceTabOrder.get("c")).toBe(2);
		expect(sectionTabOrder.get("s1")).toBe(3);
	});
});
