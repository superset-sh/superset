import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent component source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent component source
import { join } from "node:path";

describe("ModelsSettings provider cache invalidation", () => {
	const source = readFileSync(
		join(import.meta.dir, "ModelsSettings.tsx"),
		"utf8",
	);

	test("refreshes chat and workspace model queries after provider writes", () => {
		expect(source).toContain("chatModelsQueryKey(activeHostUrl)");
		expect(source).toContain("workspaceModelProvidersQueryKey(activeHostUrl)");
		expect(source).toContain("invalidateProviderCaches");
		expect(source.match(/await invalidateProviderCaches\(\)/g)?.length).toBe(2);
	});
});
