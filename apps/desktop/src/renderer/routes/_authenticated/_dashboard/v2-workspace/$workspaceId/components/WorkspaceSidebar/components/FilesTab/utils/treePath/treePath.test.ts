import { describe, expect, it } from "bun:test";
import { resolveDeleteTreePath } from "./treePath";

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
