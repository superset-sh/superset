import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { resolveFilePaths } from "./resolveFilePaths";

const cwd = resolve("/repo/pkg");

describe("resolveFilePaths", () => {
	it("anchors relative paths at the cwd and keeps absolute ones", () => {
		const absolute = resolve("/abs/d.ts");
		expect(
			resolveFilePaths(["src/a.ts", "./b.ts", "../c.ts", absolute], cwd),
		).toEqual([
			resolve(cwd, "src/a.ts"),
			resolve(cwd, "b.ts"),
			resolve(cwd, "../c.ts"),
			absolute,
		]);
	});

	it("drops repeats after resolution, keeping the first position", () => {
		expect(
			resolveFilePaths(["a.ts", resolve(cwd, "a.ts"), "b.ts", "./a.ts"], cwd),
		).toEqual([resolve(cwd, "a.ts"), resolve(cwd, "b.ts")]);
	});
});
