import { describe, expect, it } from "bun:test";
import { FileTree } from "@pierre/trees";
import { lookupDirectory, resolveDeleteTreePath } from "./treePath";

describe("resolveDeleteTreePath", () => {
	it("infers a tracked directory when watcher metadata is absent", () => {
		expect(resolveDeleteTreePath(new Set(["src/"]), "src", undefined)).toEqual({
			treePath: "src/",
			isDirectory: true,
		});
	});

	it("infers a tracked file when watcher metadata is absent", () => {
		expect(
			resolveDeleteTreePath(
				new Set(["src/index.ts"]),
				"src/index.ts",
				undefined,
			),
		).toEqual({ treePath: "src/index.ts", isDirectory: false });
	});

	it("trusts a tracked canonical directory over conflicting metadata", () => {
		expect(resolveDeleteTreePath(new Set(["src/"]), "src", false)).toEqual({
			treePath: "src/",
			isDirectory: true,
		});
	});

	it("uses explicit directory metadata for an unknown path", () => {
		expect(resolveDeleteTreePath(new Set(), "docs", true)).toEqual({
			treePath: "docs/",
			isDirectory: true,
		});
	});
});

describe("lookupDirectory", () => {
	// The watcher stats a path to decide `isDirectory` and reports false when
	// the stat loses a race with the rename that produced the event, so a
	// directory can enter the tree as a file. Every later lookup beneath it
	// then walks into a node that has no child index.
	const treeHoldingBuildAsAFile = () => {
		const model = new FileTree({ paths: ["src/out/keep.ts"] });
		model.add("build");
		return model;
	};

	it("yields no handle for a path the model cannot resolve", () => {
		const model = treeHoldingBuildAsAFile();
		expect(() => model.getItem("build/out/")).toThrow();
		expect(lookupDirectory(model, "build/out/")).toBeNull();
	});

	it("still reports an expanded directory the model does hold", () => {
		const model = treeHoldingBuildAsAFile();
		lookupDirectory(model, "src/out/")?.expand();
		expect(lookupDirectory(model, "src/out/")?.isExpanded()).toBe(true);
	});

	it("yields no handle for a file", () => {
		const model = treeHoldingBuildAsAFile();
		expect(lookupDirectory(model, "src/out/keep.ts")).toBeNull();
	});
});
