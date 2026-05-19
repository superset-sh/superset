import { describe, expect, it, mock } from "bun:test";
import type { DirectoryEntry } from "shared/file-tree-types";
import { buildGetItem, type ListDirectoryEntry } from "./buildGetItem";

function makeRefs(initialEntries: DirectoryEntry[] = []) {
	const worktreePathRef = { current: "/workspace" as string | undefined };
	const entryCacheRef = { current: new Map<string, DirectoryEntry>() };
	for (const entry of initialEntries) {
		entryCacheRef.current.set(entry.path, entry);
	}
	return { worktreePathRef, entryCacheRef };
}

function makeListDirectory(
	directoryListings: Record<string, ListDirectoryEntry[]>,
) {
	return mock(async (absolutePath: string) => ({
		entries: directoryListings[absolutePath] ?? [],
	}));
}

describe("buildGetItem", () => {
	it("returns the synthesized root entry for the 'root' item id", async () => {
		const { worktreePathRef, entryCacheRef } = makeRefs();
		const listDirectory = makeListDirectory({});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		const root = await getItem("root");
		expect(root).toEqual({
			id: "root",
			name: "root",
			path: "/workspace",
			relativePath: "",
			isDirectory: true,
		});
		expect(listDirectory).not.toHaveBeenCalled();
	});

	it("returns the cached entry without querying the filesystem", async () => {
		const cachedDirectory: DirectoryEntry = {
			id: "/workspace/plans/foo",
			name: "foo",
			path: "/workspace/plans/foo",
			relativePath: "plans/foo",
			isDirectory: true,
		};
		const { worktreePathRef, entryCacheRef } = makeRefs([cachedDirectory]);
		const listDirectory = makeListDirectory({});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		const result = await getItem("/workspace/plans/foo");
		expect(result).toBe(cachedDirectory);
		expect(listDirectory).not.toHaveBeenCalled();
	});

	// Regression test for #3827. The original implementation returned a
	// placeholder entry with `isDirectory: false` for any cache miss, which
	// caused sub-folders to silently render as flat files (with no chevron and
	// no expand-on-click) after any cache invalidation, until the user
	// restarted the entire app.
	it("resolves a sub-folder as a directory after a cache miss", async () => {
		const { worktreePathRef, entryCacheRef } = makeRefs();
		const listDirectory = makeListDirectory({
			"/workspace/plans": [
				{
					absolutePath: "/workspace/plans/foo",
					name: "foo",
					kind: "directory",
				},
				{
					absolutePath: "/workspace/plans/notes.md",
					name: "notes.md",
					kind: "file",
				},
			],
		});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		const subFolder = await getItem("/workspace/plans/foo");

		expect(subFolder.isDirectory).toBe(true);
		expect(subFolder).toEqual({
			id: "/workspace/plans/foo",
			name: "foo",
			path: "/workspace/plans/foo",
			relativePath: "plans/foo",
			isDirectory: true,
		});
		expect(listDirectory).toHaveBeenCalledWith("/workspace/plans");
	});

	it("resolves a regular file as a non-directory on cache miss", async () => {
		const { worktreePathRef, entryCacheRef } = makeRefs();
		const listDirectory = makeListDirectory({
			"/workspace/plans": [
				{
					absolutePath: "/workspace/plans/notes.md",
					name: "notes.md",
					kind: "file",
				},
			],
		});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		const file = await getItem("/workspace/plans/notes.md");

		expect(file.isDirectory).toBe(false);
		expect(file.name).toBe("notes.md");
		expect(file.relativePath).toBe("plans/notes.md");
	});

	it("populates the entry cache so subsequent lookups skip the filesystem", async () => {
		const { worktreePathRef, entryCacheRef } = makeRefs();
		const listDirectory = makeListDirectory({
			"/workspace/plans": [
				{
					absolutePath: "/workspace/plans/foo",
					name: "foo",
					kind: "directory",
				},
			],
		});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		await getItem("/workspace/plans/foo");
		await getItem("/workspace/plans/foo");

		expect(listDirectory).toHaveBeenCalledTimes(1);
		expect(entryCacheRef.current.get("/workspace/plans/foo")?.isDirectory).toBe(
			true,
		);
	});

	it("falls back to a non-directory placeholder when the parent listing fails", async () => {
		const { worktreePathRef, entryCacheRef } = makeRefs();
		const listDirectory = mock(async () => {
			throw new Error("ENOENT");
		});

		const getItem = buildGetItem({
			worktreePathRef,
			entryCacheRef,
			listDirectory,
		});

		const result = await getItem("/workspace/plans/missing");
		expect(result).toEqual({
			id: "/workspace/plans/missing",
			name: "missing",
			path: "/workspace/plans/missing",
			relativePath: "plans/missing",
			isDirectory: false,
		});
		expect(entryCacheRef.current.has("/workspace/plans/missing")).toBe(false);
	});
});
