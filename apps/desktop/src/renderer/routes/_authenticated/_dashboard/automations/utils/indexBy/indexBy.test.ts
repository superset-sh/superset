import { describe, expect, test } from "bun:test";
import { indexBy } from "./indexBy";

describe("indexBy", () => {
	test("builds a Map keyed by the selector", () => {
		const items = [
			{ id: "a", name: "Alice" },
			{ id: "b", name: "Bob" },
		];

		const result = indexBy(items, (item) => item.id);

		expect(result.size).toBe(2);
		expect(result.get("a")).toEqual({ id: "a", name: "Alice" });
		expect(result.get("b")).toEqual({ id: "b", name: "Bob" });
	});

	test("supports non-id key selectors", () => {
		const hosts = [
			{ machineId: "m1", name: "Mac" },
			{ machineId: "m2", name: "Linux" },
		];

		const result = indexBy(hosts, (h) => h.machineId);

		expect(result.get("m1")?.name).toBe("Mac");
		expect(result.get("m2")?.name).toBe("Linux");
	});

	test("the prior inline pattern throws when a nullish entry is present (#4519)", () => {
		// AutomationsPage previously built lookup maps with
		//   new Map(items.map((item) => [item.id, item]))
		// which crashes with "Cannot read properties of undefined (reading 'id')"
		// in V8 / Chromium (Electron) — matching the production stack trace in
		// the issue. Bun's JSC engine reports the same crash with different
		// wording, so we just assert that the pattern throws at all.
		const items = [{ id: "a", name: "Alice" }, undefined] as Array<{
			id: string;
			name: string;
		}>;

		expect(
			() => new Map(items.map((item) => [item.id, item] as const)),
		).toThrow(/id/);
	});

	test("regression for #4519: skips nullish entries so we never read .id on undefined", () => {
		const items: Array<{ id: string; name: string } | null | undefined> = [
			{ id: "a", name: "Alice" },
			undefined,
			null,
			{ id: "b", name: "Bob" },
		];

		const result = indexBy(items, (item) => item.id);

		expect(result.size).toBe(2);
		expect(result.get("a")?.name).toBe("Alice");
		expect(result.get("b")?.name).toBe("Bob");
	});

	test("returns an empty Map for an empty input", () => {
		const result = indexBy([] as Array<{ id: string }>, (item) => item.id);
		expect(result.size).toBe(0);
	});

	test("last entry wins when keys collide", () => {
		const items = [
			{ id: "a", name: "first" },
			{ id: "a", name: "second" },
		];

		const result = indexBy(items, (item) => item.id);

		expect(result.size).toBe(1);
		expect(result.get("a")?.name).toBe("second");
	});
});
