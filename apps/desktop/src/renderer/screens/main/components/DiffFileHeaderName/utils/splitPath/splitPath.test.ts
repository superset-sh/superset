import { describe, expect, it } from "bun:test";
import { splitPath } from "./splitPath";

describe("splitPath", () => {
	it("returns an empty dir for a root-level file", () => {
		expect(splitPath("README.md")).toEqual({ dir: "", name: "README.md" });
	});

	it("splits a nested path into dir (with trailing slash) and name", () => {
		expect(splitPath("apps/desktop/src/main.ts")).toEqual({
			dir: "apps/desktop/src/",
			name: "main.ts",
		});
	});

	it("keeps a single-level dir prefix", () => {
		expect(splitPath("src/index.ts")).toEqual({
			dir: "src/",
			name: "index.ts",
		});
	});
});
