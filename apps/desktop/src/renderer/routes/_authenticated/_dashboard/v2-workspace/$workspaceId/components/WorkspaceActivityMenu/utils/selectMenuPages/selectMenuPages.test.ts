import { describe, expect, it } from "bun:test";
import { type MenuPageSource, selectMenuPages } from "./selectMenuPages";

function page(
	id: string,
	publishedAt: string,
	overrides: Partial<MenuPageSource> = {},
): MenuPageSource {
	return {
		id,
		slug: `${id}-slug`,
		title: id,
		visibility: "org",
		publishedAt,
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

const SEEN_AT = new Date("2026-09-10T00:00:00Z").getTime();

describe("selectMenuPages", () => {
	it("orders workspace pages by latest publish and flags ones published since last seen", () => {
		const result = selectMenuPages({
			workspacePages: [
				page("old", "2026-09-01T00:00:00Z"),
				page("fresh", "2026-09-12T00:00:00Z"),
			],
			orgPages: [],
			favoritePageIds: [],
			seenAt: SEEN_AT,
		});
		expect(result.workspace.map((p) => [p.id, p.isNew])).toEqual([
			["fresh", true],
			["old", false],
		]);
		expect(result.hasNew).toBe(true);
	});

	it("falls back to updatedAt when a page has no published version", () => {
		const result = selectMenuPages({
			workspacePages: [
				page("draft", "", {
					publishedAt: null,
					updatedAt: "2026-09-05T00:00:00Z",
				}),
			],
			orgPages: [],
			favoritePageIds: [],
			seenAt: SEEN_AT,
		});
		expect(result.workspace[0]?.publishedAtMs).toBe(
			new Date("2026-09-05T00:00:00Z").getTime(),
		);
	});

	it("lists pinned pages most recently pinned first, without repeating workspace pages or flagging them new", () => {
		const result = selectMenuPages({
			workspacePages: [page("shared", "2026-09-01T00:00:00Z")],
			orgPages: [
				page("shared", "2026-09-01T00:00:00Z"),
				page("roadmap", "2026-09-12T00:00:00Z"),
				page("runbook", "2026-08-01T00:00:00Z"),
			],
			favoritePageIds: ["runbook", "shared", "roadmap", "deleted"],
			seenAt: SEEN_AT,
		});
		expect(result.pinned.map((p) => [p.id, p.isNew])).toEqual([
			["roadmap", false],
			["runbook", false],
		]);
		expect(result.hasNew).toBe(false);
	});

	it("marks just_me pages private", () => {
		const result = selectMenuPages({
			workspacePages: [
				page("mine", "2026-09-01T00:00:00Z", { visibility: "just_me" }),
			],
			orgPages: [],
			favoritePageIds: [],
			seenAt: SEEN_AT,
		});
		expect(result.workspace[0]?.isPrivate).toBe(true);
	});
});
