import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent hook source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent hook source
import { join } from "node:path";

describe("useFinalizeProjectSetup", () => {
	const source = readFileSync(
		join(import.meta.dir, "useFinalizeProjectSetup.ts"),
		"utf8",
	);

	test("hydrates project and workspace rows before relying on sidebar joins", () => {
		expect(source).toContain("collections.v2Projects.startSyncImmediate();");
		expect(source).toContain(
			"collections.v2Projects.utils.upsertSyncedRow(result.project)",
		);
		expect(source).toContain("collections.v2Workspaces.startSyncImmediate();");
		expect(source).toContain(
			"collections.v2Workspaces.utils.upsertSyncedRow(result.mainWorkspace)",
		);
		const sidebarWriteIndex = source.indexOf(
			"ensureWorkspaceInSidebar(result.mainWorkspaceId, result.projectId)",
		);
		expect(
			source.indexOf(
				"collections.v2Projects.utils.upsertSyncedRow(result.project)",
			),
		).toBeLessThan(sidebarWriteIndex);
		expect(
			source.indexOf(
				"collections.v2Workspaces.utils.upsertSyncedRow(result.mainWorkspace)",
			),
		).toBeLessThan(sidebarWriteIndex);
	});
});
