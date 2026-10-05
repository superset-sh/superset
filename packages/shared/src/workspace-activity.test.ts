import { describe, expect, it } from "bun:test";
import { getWorkspaceActivityTime } from "./workspace-activity";

const at = (iso: string) => new Date(iso).getTime();

describe("getWorkspaceActivityTime", () => {
	it("ranks by lastActivityAt alone once the host has stamped it", () => {
		// A rename bumped updatedAt well past the last agent event; the agent
		// event still wins because housekeeping is not activity.
		expect(
			getWorkspaceActivityTime({
				updatedAt: new Date("2026-08-01"),
				lastActivityAt: at("2026-03-01"),
			}),
		).toBe(at("2026-03-01"));
	});

	it("falls back to updatedAt for rows from a host that predates the column", () => {
		expect(
			getWorkspaceActivityTime({
				updatedAt: new Date("2026-05-01"),
				lastActivityAt: null,
			}),
		).toBe(at("2026-05-01"));
	});

	it("treats a NaN lastActivityAt like a missing one", () => {
		expect(
			getWorkspaceActivityTime({
				updatedAt: new Date("2026-05-01"),
				lastActivityAt: Number.NaN,
			}),
		).toBe(at("2026-05-01"));
	});
});
