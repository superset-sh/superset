import { describe, expect, test } from "bun:test";
import type { SelectV2Workspace } from "@superset/db/schema";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type {
	InFlightEntry,
	WorkspacesCreateInput,
} from "renderer/stores/workspace-creates";
import {
	type CloudRowFallbackHostRow,
	computeCloudRowFallbackWorkspaces,
} from "./computeCloudRowFallbackWorkspaces";

const PROJECT_ID = "00000000-0000-0000-0000-000000000111";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000222";
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000333";
const MACHINE_ID = "machine-1";

function createCloudRow(
	overrides: Partial<SelectV2Workspace> = {},
): SelectV2Workspace {
	const now = new Date("2026-01-01T00:00:00Z");
	return {
		id: WORKSPACE_ID,
		organizationId: ORGANIZATION_ID,
		projectId: PROJECT_ID,
		hostId: MACHINE_ID,
		name: "feat-x",
		branch: "feat-x",
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function createSnapshot(
	overrides: Partial<WorkspacesCreateInput> = {},
): WorkspacesCreateInput {
	return {
		id: WORKSPACE_ID,
		projectId: PROJECT_ID,
		hostId: MACHINE_ID,
		name: "feat-x",
		branch: "feat-x",
		...overrides,
	} as WorkspacesCreateInput;
}

function createInFlightEntry(
	overrides: Partial<InFlightEntry> = {},
): InFlightEntry {
	return {
		hostId: MACHINE_ID,
		snapshot: createSnapshot(),
		state: "creating",
		startedAt: 1,
		cloudRow: createCloudRow(),
		...overrides,
	};
}

function createLocalState(
	overrides: Partial<WorkspaceLocalStateRow["sidebarState"]> = {},
): WorkspaceLocalStateRow {
	return {
		workspaceId: WORKSPACE_ID,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		sidebarState: {
			projectId: PROJECT_ID,
			tabOrder: 1,
			sectionId: null,
			changesFilter: { kind: "all" },
			changesViewMode: "folders",
			activeTab: "changes",
			isHidden: false,
			...overrides,
		},
		paneLayout: { version: 1, tabs: [], activeTabId: null },
		viewedFiles: [],
		recentlyViewedFiles: [],
		workspaceRunTerminals: {},
	};
}

const HOST: CloudRowFallbackHostRow = { machineId: MACHINE_ID, isOnline: true };

describe("computeCloudRowFallbackWorkspaces", () => {
	test("surfaces an in-flight workspace whose v2Workspaces row hasn't synced yet", () => {
		const localState = createLocalState();
		const result = computeCloudRowFallbackWorkspaces({
			inFlightEntries: [createInFlightEntry()],
			hosts: [HOST],
			syncedWorkspaceIds: new Set(),
			getLocalState: (id) => (id === WORKSPACE_ID ? localState : undefined),
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(WORKSPACE_ID);
	});

	test("yields to the live query once the synced row has arrived", () => {
		const result = computeCloudRowFallbackWorkspaces({
			inFlightEntries: [createInFlightEntry()],
			hosts: [HOST],
			syncedWorkspaceIds: new Set([WORKSPACE_ID]),
			getLocalState: () => createLocalState(),
		});
		expect(result).toHaveLength(0);
	});

	test("filters out workspaces hidden in sidebar state", () => {
		const localState = createLocalState({ isHidden: true });
		const result = computeCloudRowFallbackWorkspaces({
			inFlightEntries: [createInFlightEntry()],
			hosts: [HOST],
			syncedWorkspaceIds: new Set(),
			getLocalState: () => localState,
		});
		expect(result).toHaveLength(0);
	});

	test("skips entries that don't yet have a cloud row", () => {
		const result = computeCloudRowFallbackWorkspaces({
			inFlightEntries: [createInFlightEntry({ cloudRow: undefined })],
			hosts: [HOST],
			syncedWorkspaceIds: new Set(),
			getLocalState: () => createLocalState(),
		});
		expect(result).toHaveLength(0);
	});

	// Regression: issue #4555 — after the user picks "Remove from sidebar",
	// `removeWorkspaceFromSidebar` deletes the local-state row. Before this
	// fix, the in-flight entry's `cloudRow` kept resurrecting the workspace
	// into the sidebar with no way to dismiss it (and the delete dialog
	// reported "Workspace is no longer available on this host." because the
	// v2Workspaces row had never arrived).
	test("does not resurrect a workspace whose sidebar entry has been removed", () => {
		const result = computeCloudRowFallbackWorkspaces({
			inFlightEntries: [createInFlightEntry()],
			hosts: [HOST],
			syncedWorkspaceIds: new Set(),
			getLocalState: () => undefined,
		});
		expect(result).toHaveLength(0);
	});
});
