import { describe, expect, it } from "bun:test";
import { FileTree } from "@pierre/trees";
import { lookupDirectory } from "../../../../utils/treePath";
import { watchExpandedDirectories } from "./watchExpandedDirectories";

describe("watchExpandedDirectories", () => {
	it("releases descendants when an ancestor closes and reacquires them on reopen", () => {
		const model = new FileTree({
			paths: ["work/deep/a.txt", "work/other.txt"],
			initialExpansion: "closed",
		});
		const active = new Set<string>();
		const acquired: string[] = [];
		const dispose = watchExpandedDirectories({
			model,
			candidates: () => ["", "work", "work/deep"],
			watch: (dir) => {
				active.add(dir);
				acquired.push(dir);
			},
			unwatch: (dir) => active.delete(dir),
		});
		expect([...active]).toEqual([]);
		lookupDirectory(model, "work/")?.expand();
		lookupDirectory(model, "work/deep/")?.expand();
		expect([...active]).toEqual(["work", "work/deep"]);
		lookupDirectory(model, "work/")?.collapse();
		expect([...active]).toEqual([]);
		lookupDirectory(model, "work/")?.expand();
		expect([...active]).toEqual(["work", "work/deep"]);
		expect(acquired).toEqual(["work", "work/deep", "work", "work/deep"]);
		dispose();
		expect([...active]).toEqual([]);
		lookupDirectory(model, "work/")?.collapse();
		lookupDirectory(model, "work/")?.expand();
		expect(acquired).toHaveLength(4);
	});
	it("releases deleted directories and never watches unseen descendants", () => {
		const model = new FileTree({
			paths: ["src/visible/a.ts", "src/closed/deep/b.ts"],
			initialExpansion: "closed",
		});
		const active = new Set<string>();
		const dispose = watchExpandedDirectories({
			model,
			candidates: () => ["src", "src/visible", "src/closed", "src/closed/deep"],
			watch: (dir) => {
				active.add(dir);
			},
			unwatch: (dir) => active.delete(dir),
		});
		lookupDirectory(model, "src/")?.expand();
		lookupDirectory(model, "src/visible/")?.expand();
		expect([...active]).toEqual(["src", "src/visible"]);
		model.remove("src/visible/", { recursive: true });
		expect([...active]).toEqual(["src"]);
		dispose();
	});
});
