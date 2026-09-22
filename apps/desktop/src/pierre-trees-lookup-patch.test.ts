import { describe, expect, test } from "bun:test";
import { FileTree } from "@pierre/trees";

// Guards the bun patch on @pierre/trees (DESKTOP-19G, patches/README.md).
// patchedDependencies is keyed to an exact version, so a version bump silently
// drops the patch while everything still builds — these assertions turn that
// into a red test. If this fails after a bump, regenerate the patch per
// patches/README.md; do NOT delete the test.
describe("@pierre/trees lookup-through-file patch", () => {
	// "build" is held as a file while a sibling directory holds the same leaf
	// name, so the lookup below finds the segment and has to walk into the
	// file node to resolve it.
	const treeHoldingBuildAsAFile = () =>
		new FileTree({ paths: ["src/out/keep.ts", "build"] });

	test("getItem answers null for a path beneath a file", () => {
		const model = treeHoldingBuildAsAFile();
		expect(model.getItem("build/out/")).toBeNull();
		expect(model.getItem("build/out/keep.ts")).toBeNull();
	});

	test("getItem still resolves the paths the model holds", () => {
		const model = treeHoldingBuildAsAFile();
		expect(model.getItem("src/out/")?.isDirectory()).toBe(true);
		expect(model.getItem("src/out/keep.ts")?.isDirectory()).toBe(false);
		expect(model.getItem("build")?.isDirectory()).toBe(false);
	});
});
