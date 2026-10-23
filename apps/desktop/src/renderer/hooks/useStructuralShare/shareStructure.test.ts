import { describe, expect, test } from "bun:test";
import { shareStructure } from "./shareStructure";

describe("shareStructure", () => {
	test("returns the previous value when nothing changed", () => {
		const before = { rows: [{ id: "a", at: new Date(5) }] };
		expect(
			shareStructure(before, { rows: [{ id: "a", at: new Date(5) }] }),
		).toBe(before);
	});

	test("keeps unchanged siblings and replaces only the changed branch", () => {
		const before = {
			rows: [
				{ id: "a", n: 1 },
				{ id: "b", n: 2 },
			],
		};
		const shared = shareStructure(before, {
			rows: [
				{ id: "a", n: 1 },
				{ id: "b", n: 3 },
			],
		});
		expect(shared).not.toBe(before);
		expect(shared.rows[0]).toBe(before.rows[0]);
		expect(shared.rows[1]).not.toBe(before.rows[1]);
	});

	test("a Date with another time is a change", () => {
		const before = { at: new Date(5) };
		expect(shareStructure(before, { at: new Date(6) })).not.toBe(before);
	});

	test("compares anything else by identity", () => {
		const fn = () => 1;
		const before = { fn };
		expect(shareStructure(before, { fn })).toBe(before);
		expect(shareStructure(before, { fn: () => 1 })).not.toBe(before);
	});

	test("an inserted item does not make the items after it look changed", () => {
		const a = { id: "a", n: 1 };
		const b = { id: "b", n: 2 };
		const before = [a, b];
		const shared = shareStructure(before, [
			{ id: "new", n: 0 },
			{ id: "a", n: 1 },
			{ id: "b", n: 2 },
		]);
		expect(shared[1]).toBe(a);
		expect(shared[2]).toBe(b);
	});

	test("pairs child wrappers by the workspace or section they carry", () => {
		const first = { type: "workspace", workspace: { id: "w1", name: "one" } };
		const second = { type: "section", section: { id: "s1", name: "group" } };
		const shared = shareStructure(
			[first, second],
			[
				{ type: "section", section: { id: "s1", name: "group" } },
				{ type: "workspace", workspace: { id: "w1", name: "one" } },
			],
		);
		expect(shared[0]).toBe(second);
		expect(shared[1]).toBe(first);
	});

	test("a reordered array is a change", () => {
		const a = { id: "a" };
		const b = { id: "b" };
		const before = [a, b];
		const shared = shareStructure(before, [{ id: "b" }, { id: "a" }]);
		expect(shared).not.toBe(before);
	});
});
