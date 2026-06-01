import { describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source regression test reads the local component file
import { join } from "node:path";

describe("SidebarHeader", () => {
	const source = readFileSync(
		join(import.meta.dir, "SidebarHeader.tsx"),
		"utf8",
	);

	it("keeps workspace sidebar tabs horizontally scrollable", () => {
		expect(source).toContain("overflow-x-auto");
		expect(source).toContain("overscroll-x-contain");
		expect(source).toContain("hide-scrollbar");
	});
});
