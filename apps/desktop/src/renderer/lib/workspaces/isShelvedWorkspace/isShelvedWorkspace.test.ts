import { describe, expect, it } from "bun:test";
import { isShelvedWorkspace, SHELF_RETENTION_MS } from "./isShelvedWorkspace";

describe("isShelvedWorkspace", () => {
	it("is false for a live row", () => {
		expect(isShelvedWorkspace({ shelvedAt: null })).toBe(false);
	});

	it("is false for a row served by a host that predates the column", () => {
		expect(isShelvedWorkspace({})).toBe(false);
	});

	it("is true once shelvedAt is set", () => {
		expect(isShelvedWorkspace({ shelvedAt: 1 })).toBe(true);
	});

	it("is false for a tombstone that kept its shelf stamp", () => {
		expect(isShelvedWorkspace({ shelvedAt: 1, archivedAt: 2 })).toBe(false);
	});

	it("keeps the retention window at 30 days", () => {
		expect(SHELF_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
	});
});
