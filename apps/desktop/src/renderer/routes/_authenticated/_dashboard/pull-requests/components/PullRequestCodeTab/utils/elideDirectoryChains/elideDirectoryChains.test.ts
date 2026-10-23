import { expect, test } from "bun:test";
import { elideDirectoryChains } from "./elideDirectoryChains";

test("elides the middle of long single-child directory chains", () => {
	const result = elideDirectoryChains([
		"apps/desktop/src/renderer/routes/Composer/Composer.tsx",
		"apps/desktop/src/renderer/routes/Composer/hooks/useTier/useTier.ts",
		"packages/ui/src/Button.tsx",
		"README.md",
	]);

	expect(Object.fromEntries(result)).toEqual({
		"apps/desktop/src/renderer/routes/Composer/Composer.tsx":
			"apps/…/routes/Composer/Composer.tsx",
		"apps/desktop/src/renderer/routes/Composer/hooks/useTier/useTier.ts":
			"apps/…/routes/Composer/hooks/useTier/useTier.ts",
		"packages/ui/src/Button.tsx": "packages/ui/src/Button.tsx",
		"README.md": "README.md",
	});
});

test("does not elide through a directory that holds files", () => {
	const result = elideDirectoryChains(["a/b/c/d/e/f/one.ts", "a/b/two.ts"]);

	expect(result.get("a/b/c/d/e/f/one.ts")).toBe("a/b/c/d/e/f/one.ts");
	expect(result.get("a/b/two.ts")).toBe("a/b/two.ts");
});
