import { describe, expect, it } from "bun:test";
import {
	filterPages,
	isPageScope,
	matchesAuthor,
	matchesScope,
	matchesSearch,
	sortPinnedFirst,
} from "./filterPages";

const page = (
	id: string,
	title: string,
	visibility: string,
	description: string | null = null,
	createdByUserId: string | null = null,
) => ({
	id,
	title,
	slug: title.toLowerCase().replace(/ /g, "-"),
	visibility,
	description,
	createdByUserId,
});

const team = page("1", "Q3 Metrics", "org", null, "user-a");
const mine = page("2", "Ingest Runbook", "just_me", "hookdeck notes", "user-b");
const other = page("3", "Warning Tokens", "org");
const published = page("4", "Launch Notes", "everyone", null, "user-a");

describe("isPageScope", () => {
	it("accepts known scopes and rejects anything else", () => {
		expect(isPageScope("all")).toBe(true);
		expect(isPageScope("pinned")).toBe(true);
		expect(isPageScope("nope")).toBe(false);
		expect(isPageScope(undefined)).toBe(false);
	});
});

describe("matchesSearch", () => {
	it("matches on title, slug, and description, case-insensitively", () => {
		expect(matchesSearch(team, "q3")).toBe(true);
		expect(matchesSearch(team, "q3-metrics")).toBe(true);
		expect(matchesSearch(mine, "HOOKDECK")).toBe(true);
		expect(matchesSearch(team, "hookdeck")).toBe(false);
	});

	it("treats blank and whitespace-only queries as no filter", () => {
		expect(matchesSearch(team, "")).toBe(true);
		expect(matchesSearch(team, "   ")).toBe(true);
	});
});

describe("matchesScope", () => {
	const pinned = new Set(["2"]);

	it("splits team and just-me by visibility", () => {
		expect(matchesScope(team, "team", pinned)).toBe(true);
		expect(matchesScope(mine, "team", pinned)).toBe(false);
		expect(matchesScope(mine, "mine", pinned)).toBe(true);
		expect(matchesScope(team, "mine", pinned)).toBe(false);
	});

	it("keeps a page shared with everyone in the team scope", () => {
		expect(matchesScope(published, "team", pinned)).toBe(true);
		expect(matchesScope(published, "mine", pinned)).toBe(false);
	});

	it("uses the pinned set rather than visibility for the pinned scope", () => {
		expect(matchesScope(mine, "pinned", pinned)).toBe(true);
		expect(matchesScope(team, "pinned", pinned)).toBe(false);
	});

	it("passes everything through for all", () => {
		expect(matchesScope(team, "all", pinned)).toBe(true);
		expect(matchesScope(mine, "all", new Set())).toBe(true);
	});
});

describe("matchesAuthor", () => {
	it("passes everything through when no author is selected", () => {
		expect(matchesAuthor(team, null)).toBe(true);
		expect(matchesAuthor(other, null)).toBe(true);
	});

	it("matches only the selected author's pages", () => {
		expect(matchesAuthor(team, "user-a")).toBe(true);
		expect(matchesAuthor(mine, "user-a")).toBe(false);
	});

	it("excludes pages without a creator when an author is selected", () => {
		expect(matchesAuthor(other, "user-a")).toBe(false);
	});
});

describe("filterPages", () => {
	it("applies search and scope together", () => {
		const result = filterPages([team, mine, other], {
			search: "e",
			scope: "team",
			pinnedPageIds: new Set(),
		});
		expect(result.map((p) => p.id)).toEqual(["1", "3"]);
	});

	it("returns nothing when the scope excludes every search hit", () => {
		expect(
			filterPages([team, mine], {
				search: "hookdeck",
				scope: "team",
				pinnedPageIds: new Set(),
			}),
		).toEqual([]);
	});

	it("applies the author filter alongside search and scope", () => {
		const result = filterPages([team, mine, other], {
			search: "",
			scope: "all",
			pinnedPageIds: new Set(),
			authorId: "user-a",
		});
		expect(result.map((p) => p.id)).toEqual(["1"]);
	});
});

describe("sortPinnedFirst", () => {
	it("floats pinned pages while preserving relative order", () => {
		const sorted = sortPinnedFirst([team, mine, other], new Set(["3"]));
		expect(sorted.map((p) => p.id)).toEqual(["3", "1", "2"]);
	});

	it("does not mutate the input array", () => {
		const input = [team, mine];
		sortPinnedFirst(input, new Set(["2"]));
		expect(input.map((p) => p.id)).toEqual(["1", "2"]);
	});
});
