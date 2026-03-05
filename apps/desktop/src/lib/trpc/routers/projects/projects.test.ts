import { describe, expect, test } from "bun:test";
import type { ExternalApp } from "@superset/local-db";

// Reproduces issue #1635: "Global default IDE setting with first-use picker
// instead of hardcoded Cursor fallback"
//
// Problem: `getDefaultApp` and `openFileInEditor` hardcode "cursor" as the
// fallback when no per-project default IDE is configured. This leaks the
// developer's personal preference, silently breaks for users who don't have
// Cursor installed, and provides no way to configure a global default.
//
// Expected behavior (per issue #1635):
//   1. A global app-level default IDE setting should be checked first.
//   2. Per-project default overrides the global setting.
//   3. When neither is set, return null so the UI shows a first-use picker.
//
// Hierarchy: per-project override > global app default > null (show picker)

/**
 * This mirrors the CURRENT (buggy) logic from:
 * apps/desktop/src/lib/trpc/routers/projects/projects.ts line 287
 *
 *   return project?.defaultApp ?? "cursor";
 */
function currentGetDefaultApp(
	projectDefaultApp: ExternalApp | null | undefined,
): ExternalApp {
	return projectDefaultApp ?? "cursor";
}

/**
 * This mirrors the CURRENT (buggy) logic from:
 * apps/desktop/src/lib/trpc/routers/external/index.ts lines 109 and 116
 *
 *   let app: ExternalApp = "cursor";
 *   app = project?.defaultApp ?? "cursor";
 */
function currentOpenFileInEditorFallback(
	projectDefaultApp: ExternalApp | null | undefined,
	hasProjectId: boolean,
): ExternalApp {
	if (hasProjectId) {
		return projectDefaultApp ?? "cursor";
	}
	// No projectId: hardcoded "cursor" with no fallback check at all
	return "cursor";
}

describe("getDefaultApp fallback — issue #1635", () => {
	test("should return null (not hardcoded 'cursor') when project has no default app", () => {
		// When a project has no per-project default app configured, the result
		// should be null so the caller can check global settings or show a picker.
		// Current behavior: returns "cursor" (hardcoded).
		const result = currentGetDefaultApp(undefined);

		// FAILS with current code: actual is "cursor", expected is null
		expect(result).toBeNull();
	});

	test("should return null (not hardcoded 'cursor') when project default app is explicitly null", () => {
		const result = currentGetDefaultApp(null);

		// FAILS with current code: actual is "cursor", expected is null
		expect(result).toBeNull();
	});

	test("should respect a global default app setting over hardcoded cursor fallback", () => {
		// A user who prefers VS Code should be able to set a global default.
		// With the current code, they would still get "cursor" for any project
		// without a per-project default.
		const globalDefault: ExternalApp = "vscode";

		// Current code ignores globalDefault entirely:
		const result = currentGetDefaultApp(undefined);

		// FAILS with current code: actual is "cursor", not globalDefault
		expect(result).toBe(globalDefault);
	});
});

describe("openFileInEditor fallback — issue #1635", () => {
	test("should not default to 'cursor' when no projectId is provided", () => {
		// When openFileInEditor is called without a projectId (e.g. from
		// ClickablePath), `app` is hardcoded to "cursor" with no fallback.
		// It should instead check a global default or return null to show a picker.
		const result = currentOpenFileInEditorFallback(undefined, false);

		// FAILS with current code: actual is "cursor", expected is null
		expect(result).toBeNull();
	});

	test("should not default to 'cursor' when projectId is provided but project has no default", () => {
		// When a project exists but has no defaultApp configured, the code falls
		// back to "cursor" instead of checking the global setting.
		const result = currentOpenFileInEditorFallback(undefined, true);

		// FAILS with current code: actual is "cursor", expected is null
		expect(result).toBeNull();
	});
});
