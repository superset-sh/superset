import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { findPanePath, getAdjacentPaneId } from "./utils";

describe("findPanePath", () => {
	it("returns empty array for single pane layout matching the id", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = findPanePath(layout, "pane-1");
		expect(result).toEqual([]);
	});

	it("returns null for single pane layout not matching the id", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = findPanePath(layout, "pane-2");
		expect(result).toBeNull();
	});

	it("returns correct path for pane in first branch", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = findPanePath(layout, "pane-1");
		expect(result).toEqual(["first"]);
	});

	it("returns correct path for pane in second branch", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = findPanePath(layout, "pane-2");
		expect(result).toEqual(["second"]);
	});

	it("returns correct path for deeply nested pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: {
				direction: "column",
				first: "pane-3",
				second: "pane-4",
			},
		};

		expect(findPanePath(layout, "pane-1")).toEqual(["first", "first"]);
		expect(findPanePath(layout, "pane-2")).toEqual(["first", "second"]);
		expect(findPanePath(layout, "pane-3")).toEqual(["second", "first"]);
		expect(findPanePath(layout, "pane-4")).toEqual(["second", "second"]);
	});

	it("returns null for missing pane id in complex layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: "pane-3",
		};
		const result = findPanePath(layout, "pane-99");
		expect(result).toBeNull();
	});

	it("handles asymmetric nested layouts", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "column",
				first: {
					direction: "row",
					first: "pane-2",
					second: "pane-3",
				},
				second: "pane-4",
			},
		};

		expect(findPanePath(layout, "pane-1")).toEqual(["first"]);
		expect(findPanePath(layout, "pane-2")).toEqual([
			"second",
			"first",
			"first",
		]);
		expect(findPanePath(layout, "pane-3")).toEqual([
			"second",
			"first",
			"second",
		]);
		expect(findPanePath(layout, "pane-4")).toEqual(["second", "second"]);
	});
});

describe("getAdjacentPaneId", () => {
	it("returns null for single pane layout", () => {
		const layout: MosaicNode<string> = "pane-1";
		const result = getAdjacentPaneId(layout, "pane-1");
		expect(result).toBeNull();
	});

	it("returns next pane when closing first pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-1");
		expect(result).toBe("pane-2");
	});

	it("returns previous pane when closing last pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-2");
		expect(result).toBe("pane-1");
	});

	it("returns next pane when closing middle pane", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "row",
				first: "pane-2",
				second: "pane-3",
			},
		};
		// Visual order: pane-1, pane-2, pane-3
		const result = getAdjacentPaneId(layout, "pane-2");
		expect(result).toBe("pane-3");
	});

	it("returns previous pane when closing last in multi-pane layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: {
				direction: "row",
				first: "pane-2",
				second: "pane-3",
			},
		};
		// Visual order: pane-1, pane-2, pane-3
		const result = getAdjacentPaneId(layout, "pane-3");
		expect(result).toBe("pane-2");
	});

	it("returns first pane when closing pane id not found", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "pane-1",
			second: "pane-2",
		};
		const result = getAdjacentPaneId(layout, "pane-99");
		expect(result).toBe("pane-1");
	});

	it("handles complex nested layouts", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: {
				direction: "column",
				first: "pane-1",
				second: "pane-2",
			},
			second: {
				direction: "column",
				first: "pane-3",
				second: "pane-4",
			},
		};
		// Visual order: pane-1, pane-2, pane-3, pane-4

		expect(getAdjacentPaneId(layout, "pane-1")).toBe("pane-2");
		expect(getAdjacentPaneId(layout, "pane-2")).toBe("pane-3");
		expect(getAdjacentPaneId(layout, "pane-3")).toBe("pane-4");
		expect(getAdjacentPaneId(layout, "pane-4")).toBe("pane-3"); // Last pane goes to previous
	});
});
