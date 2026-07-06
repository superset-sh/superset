import { describe, expect, test } from "bun:test";
import { getBaseName } from "renderer/lib/pathBasename";
import { disambiguateProjectLabels } from "./disambiguateProjectLabels";

describe("issue #5480: workspaces with identical folder names", () => {
	// Reproduces the reported bug at its root: a project's display name is the
	// path basename, so two projects at different paths but the same leaf folder
	// name render identically with no way to tell them apart.
	test("reproduction: basename-derived names collide for different paths", () => {
		const pathA = "/Users/me/projects/client-a/app";
		const pathB = "/Users/me/projects/client-b/app";

		const nameA = getBaseName(pathA);
		const nameB = getBaseName(pathB);

		// Both display as "app" — the bug: indistinguishable in the UI.
		expect(nameA).toBe("app");
		expect(nameB).toBe("app");
		expect(nameA).toBe(nameB);
	});

	test("disambiguates colliding names with minimal parent context", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "/Users/me/projects/client-a/app" },
			{ id: "b", name: "app", path: "/Users/me/projects/client-b/app" },
		]);

		// Each colliding entry now gets a distinguishing parent segment.
		expect(labels.get("a")).toBe("client-a");
		expect(labels.get("b")).toBe("client-b");
		expect(labels.get("a")).not.toBe(labels.get("b"));
	});
});

describe("disambiguateProjectLabels", () => {
	test("returns null for unique names", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "web", path: "/Users/me/projects/web" },
			{ id: "b", name: "api", path: "/Users/me/projects/api" },
		]);

		expect(labels.get("a")).toBeNull();
		expect(labels.get("b")).toBeNull();
	});

	test("only disambiguates the entries whose names collide", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "/work/client-a/app" },
			{ id: "b", name: "app", path: "/work/client-b/app" },
			{ id: "c", name: "docs", path: "/work/docs" },
		]);

		expect(labels.get("a")).toBe("client-a");
		expect(labels.get("b")).toBe("client-b");
		expect(labels.get("c")).toBeNull();
	});

	test("walks further up the tree when the nearest parents also match", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "/work/client-a/repo/app" },
			{ id: "b", name: "app", path: "/work/client-b/repo/app" },
		]);

		// Nearest parent "repo" is shared, so include the next segment up.
		expect(labels.get("a")).toBe("client-a/repo");
		expect(labels.get("b")).toBe("client-b/repo");
	});

	test("handles three-way collisions", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "/a/app" },
			{ id: "b", name: "app", path: "/b/app" },
			{ id: "c", name: "app", path: "/c/app" },
		]);

		expect(labels.get("a")).toBe("a");
		expect(labels.get("b")).toBe("b");
		expect(labels.get("c")).toBe("c");
	});

	test("supports Windows-style paths", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "C:\\work\\client-a\\app" },
			{ id: "b", name: "app", path: "C:\\work\\client-b\\app" },
		]);

		expect(labels.get("a")).toBe("client-a");
		expect(labels.get("b")).toBe("client-b");
	});

	test("falls back to the full parent path when one path nests the other", () => {
		const labels = disambiguateProjectLabels([
			{ id: "a", name: "app", path: "/app" },
			{ id: "b", name: "app", path: "/nested/app" },
		]);

		// The root-level entry has no parent to show; the nested one gets its parent.
		expect(labels.get("a")).toBeNull();
		expect(labels.get("b")).toBe("nested");
	});
});
