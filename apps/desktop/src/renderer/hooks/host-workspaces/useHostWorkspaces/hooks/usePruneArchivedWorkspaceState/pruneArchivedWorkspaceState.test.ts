import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import {
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { pruneArchivedWorkspaceState } from "./pruneArchivedWorkspaceState";

function fixture(count = 3) {
	let persisted = "";
	let writes = 0;
	let writeError: Error | undefined;
	const collection = createCollection(
		localStorageCollectionOptions({
			id: crypto.randomUUID(),
			storageKey: "test-archived-state",
			schema: workspaceLocalStateSchema,
			getKey: (row: WorkspaceLocalStateRow) => row.workspaceId,
			startSync: true,
			gcTime: 0,
			storage: {
				getItem: () => persisted || null,
				setItem: (_key, value) => {
					if (writeError) throw writeError;
					persisted = value;
					writes++;
				},
				removeItem: () => {},
			},
			storageEventApi: {
				addEventListener: () => {},
				removeEventListener: () => {},
			},
		}),
	);
	const rows = Array.from({ length: count }, () =>
		workspaceLocalStateSchema.parse({
			workspaceId: crypto.randomUUID(),
			createdAt: new Date(),
			sidebarState: { projectId: null },
			paneLayout: { version: 1, tabs: [], activeTabId: null },
		}),
	);
	collection.insert(rows);
	const controller = new AbortController();
	return {
		collection,
		rows,
		controller,
		options: {
			collection,
			signal: controller.signal,
			cleanupRuntimes: (_rows: WorkspaceLocalStateRow[]) => {},
		},
		persisted: () => persisted,
		writes: () => writes,
		failWrites: (error: Error) => {
			writeError = error;
		},
	};
}

describe("archived workspace local state", () => {
	it("preserves runtimes when a failed persisted deletion rolls back", async () => {
		const f = fixture();
		const persistedBefore = f.persisted();
		const cleaned: string[] = [];
		f.failWrites(new Error("storage unavailable"));
		try {
			await expect(
				pruneArchivedWorkspaceState({
					...f.options,
					getArchivedIds: async (ids) => ids,
					cleanupRuntimes: (rows) =>
						cleaned.push(...rows.map((row) => row.workspaceId)),
				}),
			).rejects.toThrow("storage unavailable");
			expect(f.collection.state.size).toBe(3);
			expect(f.persisted()).toBe(persistedBefore);
			expect(cleaned).toEqual([]);
		} finally {
			await f.collection.cleanup();
		}
	});

	it("prunes only confirmed IDs in one persisted write across request batches", async () => {
		const f = fixture(502);
		const ids = f.rows.map((row) => row.workspaceId);
		const batches: number[] = [];
		const cleaned: string[] = [];
		const writesBefore = f.writes();
		const count = await pruneArchivedWorkspaceState({
			...f.options,
			getArchivedIds: async (batch) => {
				batches.push(batch.length);
				return batch.filter((id) => id !== ids[0]);
			},
			cleanupRuntimes: (rows) =>
				cleaned.push(...rows.map((row) => row.workspaceId)),
		});
		expect(count).toBe(501);
		expect(batches).toEqual([500, 2]);
		expect(f.writes() - writesBefore).toBe(1);
		expect([...f.collection.state.keys()]).toEqual([ids[0]]);
		expect(Object.keys(JSON.parse(f.persisted()))).toHaveLength(1);
		expect(cleaned).toHaveLength(501);
		await f.collection.cleanup();
	});

	it("retains rows when a host fails after returning an earlier batch", async () => {
		const f = fixture(501);
		let requests = 0;
		await expect(
			pruneArchivedWorkspaceState({
				...f.options,
				getArchivedIds: async (batch) => {
					if (++requests === 2) throw new Error("offline");
					return batch;
				},
			}),
		).rejects.toThrow("offline");
		expect(f.collection.state.size).toBe(501);
		await f.collection.cleanup();
	});

	it("does not apply a result after the owning query was cancelled", async () => {
		const f = fixture();
		await expect(
			pruneArchivedWorkspaceState({
				...f.options,
				getArchivedIds: async (batch) => {
					f.controller.abort();
					return batch;
				},
			}),
		).rejects.toThrow();
		expect(f.collection.state.size).toBe(3);
		await f.collection.cleanup();
	});

	it("preserves rows edited while the host confirmation was in flight", async () => {
		const f = fixture();
		const id = f.rows[0].workspaceId;
		await pruneArchivedWorkspaceState({
			...f.options,
			getArchivedIds: async () => {
				f.collection.update(id, (draft) => {
					draft.sidebarState.isHidden = true;
				});
				return [id, "unrequested-workspace"];
			},
		});
		expect(f.collection.state.size).toBe(3);
		expect(f.collection.get(id)?.sidebarState.isHidden).toBe(true);
		await f.collection.cleanup();
	});
});
