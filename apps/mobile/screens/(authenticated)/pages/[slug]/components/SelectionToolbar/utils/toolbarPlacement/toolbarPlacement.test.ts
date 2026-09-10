import { describe, expect, test } from "bun:test";
import { toolbarPlacement } from "./toolbarPlacement";

const container = { width: 390, height: 800 };
const size = { width: 252, height: 52 };

describe("toolbarPlacement", () => {
	test("sits above the element when there is room", () => {
		const { top } = toolbarPlacement({
			rect: { left: 40, top: 400, width: 300, height: 40 },
			container,
			size,
		});
		expect(top).toBe(400 - size.height - 8);
	});

	test("flips below when the element is near the top", () => {
		const rect = { left: 40, top: 4, width: 300, height: 40 };
		const { top } = toolbarPlacement({ rect, container, size });
		expect(top).toBe(rect.top + rect.height + 8);
	});

	test("centres on the element horizontally", () => {
		const { left } = toolbarPlacement({
			rect: { left: 69, top: 400, width: 252, height: 40 },
			container,
			size,
		});
		expect(left).toBe(69);
	});

	test("clamps inside the frame so an edge pick stays reachable", () => {
		const { left } = toolbarPlacement({
			rect: { left: 360, top: 400, width: 20, height: 40 },
			container,
			size,
		});
		expect(left).toBe(container.width - size.width - 8);
		expect(left).toBeGreaterThanOrEqual(8);
	});

	test("clamps to the bottom edge for an element scrolled past the frame", () => {
		const { top } = toolbarPlacement({
			rect: { left: 40, top: 900, width: 300, height: 40 },
			container,
			size,
		});
		expect(top).toBe(container.height - size.height - 8);
	});
});
