import { describe, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test inspects files directly
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test inspects files directly
import { join } from "node:path";

describe("V2WorkspaceTitle remote host indicator", () => {
	it("renders a remote host badge for non-local workspaces", () => {
		const source = readFileSync(
			join(import.meta.dir, "V2WorkspaceTitle.tsx"),
			"utf-8",
		);

		expect(source).toContain("workspace.hostId !== machineId");
		expect(source).toContain("Remote host:");
		expect(source).toContain("remoteHostName");
		expect(source).toContain("Monitor");
	});
});
