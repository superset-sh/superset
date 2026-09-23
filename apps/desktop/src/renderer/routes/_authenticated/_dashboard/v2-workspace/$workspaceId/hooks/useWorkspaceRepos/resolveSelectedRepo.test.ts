import { describe, expect, test } from "bun:test";
import { resolveSelectedRepo } from "./resolveSelectedRepo";

const repos = [
	{ folder: "api", path: "/w/api" },
	{ folder: "web", path: "/w/web" },
];

describe("resolveSelectedRepo", () => {
	test("defaults to the primary when nothing is stored", () => {
		expect(resolveSelectedRepo(repos, undefined)?.folder).toBe("api");
	});

	test("returns the stored folder when it still exists", () => {
		expect(resolveSelectedRepo(repos, "web")?.path).toBe("/w/web");
	});

	test("falls back to the primary when the stored folder is gone", () => {
		expect(resolveSelectedRepo(repos, "removed")?.folder).toBe("api");
	});

	test("returns undefined when the workspace has no checkouts", () => {
		expect(resolveSelectedRepo([], "web")).toBeUndefined();
	});
});
