import { describe, expect, it } from "bun:test";
import type { ProvisionalEntry } from "./provisionalEntry";
import { reduceProvisional } from "./provisionalEntry";

const ROOT = "/workspace";
const VERSION = 1;

function folderEntry(
	overrides: Partial<ProvisionalEntry> = {},
): ProvisionalEntry {
	return {
		key: "Untitled/",
		absolutePath: `${ROOT}/Untitled`,
		mode: "folder",
		rootPath: ROOT,
		versionToken: VERSION,
		...overrides,
	};
}

/** The `removed` event as the Files tab dispatches it for the current workspace. */
function removedHere(path: string) {
	return {
		type: "removed" as const,
		path,
		rootPath: ROOT,
		versionToken: VERSION,
	};
}

describe("reduceProvisional", () => {
	it("arms on creation", () => {
		const entry = folderEntry();

		const result = reduceProvisional(null, { type: "created", entry });

		expect(result.state).toEqual(entry);
		expect(result.action).toEqual({ type: "none" });
	});

	it("cleans up when its own entry is removed in the same workspace", () => {
		const entry = folderEntry();

		const result = reduceProvisional(entry, removedHere("Untitled/"));

		expect(result.state).toBeNull();
		expect(result.action).toEqual({ type: "cleanup", entry });
	});

	it("disarms once the entry is committed under a new name", () => {
		const entry = folderEntry();

		const committed = reduceProvisional(entry, {
			type: "renamed",
			sourceKey: "Untitled/",
		});

		expect(committed.state).toBeNull();
		expect(
			reduceProvisional(committed.state, removedHere("Untitled/")).action,
		).toEqual({ type: "none" });
	});

	it("ignores removal of an unrelated path", () => {
		const entry = folderEntry();

		expect(reduceProvisional(entry, removedHere("src/other/")).action).toEqual({
			type: "none",
		});
	});

	it("ignores removal after a workspace switch", () => {
		const entry = folderEntry();

		// Same path, different workspace root.
		expect(
			reduceProvisional(entry, {
				type: "removed",
				path: "Untitled/",
				rootPath: "/other-workspace",
				versionToken: VERSION,
			}).action,
		).toEqual({ type: "none" });

		// Same root, but the bridge version moved on.
		expect(
			reduceProvisional(entry, {
				type: "removed",
				path: "Untitled/",
				rootPath: ROOT,
				versionToken: VERSION + 1,
			}).action,
		).toEqual({ type: "none" });
	});

	it("drops state on workspace change without deleting anything", () => {
		const result = reduceProvisional(folderEntry(), {
			type: "workspace-changed",
		});

		expect(result.state).toBeNull();
		expect(result.action).toEqual({ type: "none" });
	});

	describe("stale provisional state cannot delete a committed folder", () => {
		// Accepting the default name commits the folder, but Pierre emits no
		// rename/error/remove event for an unchanged commit, so the entry stays
		// armed. Both guards below must independently prevent a later collision +
		// Esc on that same folder from deleting it.
		const staleAfterUnchangedCommit = folderEntry();

		it("disarms when the user starts their own rename (F2 / context menu)", () => {
			const result = reduceProvisional(staleAfterUnchangedCommit, {
				type: "manual-rename-started",
			});

			expect(result.state).toBeNull();
			expect(result.action).toEqual({ type: "none" });
			expect(
				reduceProvisional(result.state, removedHere("Untitled/")).action,
			).toEqual({ type: "none" });
		});

		it("disarms on a rename error before reopening the rename", () => {
			const errored = reduceProvisional(staleAfterUnchangedCommit, {
				type: "rename-error",
			});

			// Reopens so the user can fix the name, but is no longer armed — the
			// caller must start that session without `removeIfCanceled`.
			expect(errored.action).toEqual({
				type: "reopen-rename",
				key: "Untitled/",
			});
			expect(errored.state).toBeNull();

			// The Esc that follows must not delete the committed folder.
			expect(
				reduceProvisional(errored.state, removedHere("Untitled/")).action,
			).toEqual({ type: "none" });
		});
	});

	it("does nothing on a rename error with no provisional entry", () => {
		const result = reduceProvisional(null, { type: "rename-error" });

		expect(result.state).toBeNull();
		expect(result.action).toEqual({ type: "none" });
	});
});
