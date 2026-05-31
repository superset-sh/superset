import { describe, expect, it } from "bun:test";
import {
	buildRouterHistoryStateForPath,
	normalizeHashPath,
} from "./desktop-automation";

describe("normalizeHashPath", () => {
	it("keeps absolute app paths unchanged", () => {
		expect(normalizeHashPath("/tasks")).toBe("/tasks");
	});

	it("adds a leading slash to relative app paths", () => {
		expect(normalizeHashPath("tasks")).toBe("/tasks");
	});

	it("uses root for blank paths", () => {
		expect(normalizeHashPath("  ")).toBe("/");
	});
});

describe("buildRouterHistoryStateForPath", () => {
	it("appends the target path after the current history index", () => {
		const state = buildRouterHistoryStateForPath(
			"/tasks",
			JSON.stringify({
				entries: ["/", "/v2-workspaces", "/settings"],
				index: 1,
			}),
		);

		expect(JSON.parse(state)).toEqual({
			entries: ["/", "/v2-workspaces", "/tasks"],
			index: 2,
		});
	});

	it("does not duplicate the current target path", () => {
		const state = buildRouterHistoryStateForPath(
			"/tasks",
			JSON.stringify({
				entries: ["/", "/tasks"],
				index: 1,
			}),
		);

		expect(JSON.parse(state)).toEqual({
			entries: ["/", "/tasks"],
			index: 1,
		});
	});

	it("falls back to root when stored history is invalid", () => {
		const state = buildRouterHistoryStateForPath("/tasks", "not-json");

		expect(JSON.parse(state)).toEqual({
			entries: ["/", "/tasks"],
			index: 1,
		});
	});

	it("caps stored history at one hundred entries", () => {
		const entries = Array.from({ length: 100 }, (_, index) => `/p/${index}`);
		const state = buildRouterHistoryStateForPath(
			"/tasks",
			JSON.stringify({ entries, index: entries.length - 1 }),
		);
		const parsed = JSON.parse(state) as { entries: string[]; index: number };

		expect(parsed.entries).toHaveLength(100);
		expect(parsed.entries.at(-1)).toBe("/tasks");
		expect(parsed.index).toBe(99);
	});
});
