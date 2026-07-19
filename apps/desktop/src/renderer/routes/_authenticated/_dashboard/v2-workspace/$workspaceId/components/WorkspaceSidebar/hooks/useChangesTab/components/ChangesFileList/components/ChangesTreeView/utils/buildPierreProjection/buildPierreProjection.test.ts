import { describe, expect, test } from "bun:test";
import {
	buildPierreProjection,
	compareFolderProjectionEntries,
} from "./buildPierreProjection";

describe("buildPierreProjection", () => {
	test("keeps real paths in tree mode", () => {
		const projection = buildPierreProjection(
			["README.md", "src/components/Button.tsx"],
			"tree",
		);

		expect(projection.paths).toEqual([
			"README.md",
			"src/components/Button.tsx",
		]);
		expect(projection.directoryPathByTreePath.get("src/components")).toBe(
			"src/components",
		);
	});

	test("projects immediate parents into one Pierre directory", () => {
		const projection = buildPierreProjection(
			[
				"README.md",
				"src/components/Button.tsx",
				"src/components/Input.tsx",
				"src/utils/format.ts",
			],
			"folders",
		);

		expect(projection.paths).toEqual([
			"Root Path/README.md",
			"src › components/Button.tsx",
			"src › components/Input.tsx",
			"src › utils/format.ts",
		]);
		expect(
			projection.filePathByTreePath.get("src › components/Button.tsx"),
		).toBe("src/components/Button.tsx");
		expect(projection.directoryPathByTreePath.get("src › components")).toBe(
			"src/components",
		);
	});

	test("keeps root and same-named folders distinct", () => {
		const projection = buildPierreProjection(
			["root.txt", "Root Path/nested.txt"],
			"folders",
		);

		expect(projection.paths).toEqual([
			"Root Path/root.txt",
			"Root Path (2)/nested.txt",
		]);
		expect(projection.directoryPathByTreePath.get("Root Path")).toBe("");
		expect(projection.directoryPathByTreePath.get("Root Path (2)")).toBe(
			"Root Path",
		);
	});
});

describe("compareFolderProjectionEntries", () => {
	test("orders root first, then directories, then files descending", () => {
		const directory = (basename: string) => ({
			basename,
			depth: 0,
			isDirectory: true,
			path: `${basename}/`,
			segments: [basename],
		});
		const file = (basename: string) => ({
			basename,
			depth: 1,
			isDirectory: false,
			path: `src/${basename}`,
			segments: ["src", basename],
		});

		expect(
			[directory("src"), directory("Root Path"), directory("apps")].sort(
				compareFolderProjectionEntries,
			),
		).toEqual([directory("Root Path"), directory("apps"), directory("src")]);
		expect(
			[file("a.ts"), file("z.ts")].sort(compareFolderProjectionEntries),
		).toEqual([file("z.ts"), file("a.ts")]);
	});
});
