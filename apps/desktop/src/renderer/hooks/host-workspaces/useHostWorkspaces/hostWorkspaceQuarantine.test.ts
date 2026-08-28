import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	type DashboardSidebarSectionRow,
	dashboardSidebarSectionSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { writeWorkspacePaneLayout } from "renderer/stores/workspace-creates/writeWorkspacePaneLayout";
import {
	type HostWorkspaceRow,
	type HostWorkspacesQueryTarget,
	mergeHostWorkspaces,
} from "./useHostWorkspaces.utils";

/**
 * A host serving one unrepresentable row used to take the whole dashboard
 * down: the sidebar reconciler inserted it into `v2WorkspaceLocalState`,
 * TanStack DB threw `SchemaValidationError` synchronously out of the effect,
 * and the root error boundary ("Something went wrong") swallowed the app.
 */

const WORKSPACE_A = "8f6bf4e6-0f8a-4d4a-9f0b-9c1d2e3f4a5b";
const WORKSPACE_B = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const WORKSPACE_C = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
const WORKSPACE_D = "9d0e1f2a-3b4c-4d5e-8f6a-7b8c9d0e1f2a";
const PROJECT = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";

const target: HostWorkspacesQueryTarget = {
	machineId: "machine-1",
	organizationId: "org-1",
	hostUrl: "http://127.0.0.1:1234",
	isLocal: true,
};

function hostRow(
	id: string,
	projectId: string | null,
	name: string,
): HostWorkspaceRow {
	return {
		id,
		organizationId: target.organizationId,
		projectId,
		hostId: target.machineId,
		name,
		branch: `branch/${name}`,
		type: projectId === null ? "session" : "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		worktreePath: `/tmp/${name}`,
		worktreeExists: true,
	};
}

function makeMapStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => {
			map.set(key, value);
		},
		removeItem: (key: string) => {
			map.delete(key);
		},
	};
}

const noopEvents = {
	addEventListener: () => {},
	removeEventListener: () => {},
};

/** The two real collections `writeWorkspacePaneLayout` touches. */
function makeCollections(storageKeyPrefix: string): AppCollections {
	const storage = makeMapStorage();
	const v2WorkspaceLocalState = createCollection(
		localStorageCollectionOptions({
			id: `${storageKeyPrefix}-local-state`,
			storageKey: `${storageKeyPrefix}-local-state`,
			schema: workspaceLocalStateSchema,
			getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
			storage,
			storageEventApi: noopEvents,
			startSync: true,
			gcTime: 0,
		}),
	);
	const v2SidebarSections = createCollection(
		localStorageCollectionOptions({
			id: `${storageKeyPrefix}-sections`,
			storageKey: `${storageKeyPrefix}-sections`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item: DashboardSidebarSectionRow) => item.sectionId,
			storage,
			storageEventApi: noopEvents,
			startSync: true,
			gcTime: 0,
		}),
	);
	return { v2WorkspaceLocalState, v2SidebarSections } as AppCollections;
}

describe("host workspace ingest quarantine", () => {
	it("hides every unrepresentable row and still syncs the rest of the host's list", () => {
		const rows: HostWorkspaceRow[] = [
			hostRow(WORKSPACE_A, PROJECT, "good-one"),
			hostRow("not-a-uuid", PROJECT, "bad-id"),
			hostRow(WORKSPACE_D, "also-not-a-uuid", "bad-project"),
			// A project-less session: a null projectId is an absence, not a
			// violation, so this row has to survive.
			hostRow(WORKSPACE_B, null, "session"),
			// `workspace.list` is cast, never parsed, so the row type lies about
			// the wire — a missing id must be dropped, not thrown on.
			{
				...hostRow(WORKSPACE_C, PROJECT, "no-id"),
				id: undefined as unknown as string,
			},
			hostRow(WORKSPACE_C, PROJECT, "good-two"),
		];

		const merged = mergeHostWorkspaces({
			hostResults: [{ target, rows, reachable: true }],
		});
		expect(merged.map((row) => row.name)).toEqual([
			"good-one",
			"session",
			"good-two",
		]);

		const collections = makeCollections("quarantine-sync");
		// The write the sidebar reconciler performs for each ingested row. It
		// throwing here is exactly what reached the root error boundary.
		for (const workspace of merged) {
			writeWorkspacePaneLayout(
				collections,
				{ id: workspace.id, projectId: workspace.projectId },
				[],
				[],
			);
		}

		expect([...collections.v2WorkspaceLocalState.state.keys()].sort()).toEqual(
			[WORKSPACE_A, WORKSPACE_B, WORKSPACE_C].sort(),
		);
	});

	it("still rejects the malformed row at the collection, so validation is not silenced", () => {
		const collections = makeCollections("quarantine-strict");
		expect(() =>
			writeWorkspacePaneLayout(
				collections,
				{ id: "not-a-uuid", projectId: PROJECT },
				[],
				[],
			),
		).toThrow();
		expect(collections.v2WorkspaceLocalState.size).toBe(0);
	});
});
