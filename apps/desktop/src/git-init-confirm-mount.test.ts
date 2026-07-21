// Asserts the git-init confirm dialog is mounted where every folder-import
// caller can reach it.
//
// `useGitInitConfirmStore.request()` returns a promise that is ONLY settled by
// a mounted <GitInitConfirmDialog />. If a route triggers the folder-first
// import flow without that dialog somewhere above it, the promise never
// resolves: the import silently hangs forever with no error and no UI.
//
// That is exactly what happened to onboarding — #5036 added the requestGitInit
// step to the shared useFolderFirstImport hook, but the dialog was mounted only
// by AddRepositoryModals under _dashboard. Picking a non-git folder during
// onboarding stranded the flow on a blank step. The hook's unit tests mock
// `renderer/stores/git-init-confirm` outright, so they cannot see a missing
// mount — hence this structural test.
//
// Why grep rather than a render test: the desktop renderer has no
// testing-library/jsdom setup, and mounting a route tree would require faking
// the router, auth session, host service, and Electron IPC. This catches the
// regression class directly.
//
// Lives at src/ rather than beside the routes it checks because renderer code
// may not import Node builtins (biome.jsonc noRestrictedImports).

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const RENDERER_DIR = path.resolve(import.meta.dirname, "renderer");

// Callers that park a promise on the confirm store, directly or via the hook.
const CALLER_PATTERNS = [
	/\buseRequestGitInitConfirm\b/,
	/\buseFolderFirstImport\b/,
];

// JSX mount of the dialog, e.g. `<GitInitConfirmDialog />`.
const MOUNT_PATTERN = /<GitInitConfirmDialog\b/;

function* walk(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			yield* walk(full);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
		yield full;
	}
}

const sourceFiles = [...walk(RENDERER_DIR)].map((file) => ({
	file,
	relative: path.relative(RENDERER_DIR, file),
	text: fs.readFileSync(file, "utf8"),
}));

describe("git-init confirm dialog mount", () => {
	test("is mounted in the _authenticated layout, the shared ancestor of every caller", () => {
		const layout = sourceFiles.find(
			(f) => f.relative === path.join("routes", "_authenticated", "layout.tsx"),
		);

		expect(layout).toBeDefined();
		// A caller under any authenticated route (dashboard, onboarding, future
		// ones) resolves its confirm promise through this single mount.
		expect(MOUNT_PATTERN.test(layout?.text ?? "")).toBe(true);
	});

	test("is mounted exactly once so two dialogs never open together", () => {
		const mounts = sourceFiles
			.filter((f) => MOUNT_PATTERN.test(f.text))
			.map((f) => f.relative)
			.sort();

		// The store keeps a single module-level pendingResolve, so a second
		// mounted instance would render a duplicate AlertDialog off one request.
		expect(mounts).toEqual([
			path.join("routes", "_authenticated", "layout.tsx"),
		]);
	});

	test("every folder-import caller sits under the _authenticated tree", () => {
		const callers = sourceFiles
			.filter(
				(f) =>
					// The hook and store definitions (and their tests) declare these
					// names rather than calling them.
					!f.relative.includes("useFolderFirstImport") &&
					f.relative !== path.join("stores", "git-init-confirm.ts") &&
					CALLER_PATTERNS.some((pattern) => pattern.test(f.text)),
			)
			.map((f) => f.relative)
			.sort();

		// Guards the assumption that makes a single layout mount sufficient. A
		// caller mounted outside _authenticated would hang the same way
		// onboarding did, and needs its own dialog mount.
		expect(callers.length).toBeGreaterThan(0);
		for (const caller of callers) {
			const reachesMount =
				caller.startsWith(path.join("routes", "_authenticated")) ||
				// Rendered by _dashboard/layout.tsx, itself under _authenticated.
				caller.startsWith("commandPalette");
			expect(reachesMount, `${caller} cannot reach the dialog mount`).toBe(
				true,
			);
		}
	});
});
