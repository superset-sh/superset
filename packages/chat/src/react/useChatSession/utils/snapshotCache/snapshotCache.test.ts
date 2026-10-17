import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { emptySnapshot } from "../../../../core";
import { cachedSnapshot, cacheSnapshot } from "./snapshotCache";

describe("snapshotCache", () => {
	test("keeps the five most recently cached sessions", () => {
		const ids = Array.from({ length: 6 }, () => randomUUID());
		for (const id of ids) cacheSnapshot(id, emptySnapshot());
		cacheSnapshot(ids[1] ?? "", emptySnapshot());
		cacheSnapshot(randomUUID(), emptySnapshot());

		expect(cachedSnapshot(ids[0] ?? "")).toBeUndefined();
		expect(cachedSnapshot(ids[2] ?? "")).toBeUndefined();
		expect(cachedSnapshot(ids[1] ?? "")).toBeDefined();
		expect(cachedSnapshot(ids[5] ?? "")).toBeDefined();
	});
});
