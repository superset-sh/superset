import { describe, expect, test } from "bun:test";
import type { SelectV2Workspace } from "@superset/db/schema";
import type { InFlightEntry } from "renderer/stores/workspace-creates";
import { buildCloudRowFallbackWorkspaces } from "./buildCloudRowFallbackWorkspaces";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const HOST_ID = "host-a";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

function makeCloudRow(
	overrides: Partial<SelectV2Workspace> = {},
): SelectV2Workspace {
	return {
		id: WORKSPACE_ID,
		organizationId: "33333333-3333-3333-3333-333333333333",
		projectId: PROJECT_ID,
		hostId: HOST_ID,
		name: "feature-x",
		branch: "feature-x",
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	} as SelectV2Workspace;
}

function makeEntry(overrides: Partial<InFlightEntry> = {}): InFlightEntry {
	return {
		hostId: HOST_ID,
		snapshot: {
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			hostId: HOST_ID,
			name: "feature-x",
			branch: "feature-x",
			type: "worktree",
		} as InFlightEntry["snapshot"],
		state: "creating",
		startedAt: 0,
		cloudRow: makeCloudRow(),
		...overrides,
	};
}

describe("buildCloudRowFallbackWorkspaces", () => {
	test("returns no rows when there are no in-flight entries", () => {
		expect(
			buildCloudRowFallbackWorkspaces({
				inFlightEntries: [],
				hosts: [{ machineId: HOST_ID, isOnline: true }],
				localStateWorkspaceIds: new Set(),
				getWorkspaceLocalState: () => undefined,
			}),
		).toEqual([]);
	});

	test("skips entries without a cloud row (still preparing on the host)", () => {
		expect(
			buildCloudRowFallbackWorkspaces({
				inFlightEntries: [makeEntry({ cloudRow: undefined })],
				hosts: [{ machineId: HOST_ID, isOnline: true }],
				localStateWorkspaceIds: new Set(),
				getWorkspaceLocalState: () => undefined,
			}),
		).toEqual([]);
	});

	test("defers to the live query once Electric has delivered the workspace", () => {
		expect(
			buildCloudRowFallbackWorkspaces({
				inFlightEntries: [makeEntry()],
				hosts: [{ machineId: HOST_ID, isOnline: true }],
				localStateWorkspaceIds: new Set([WORKSPACE_ID]),
				getWorkspaceLocalState: () => undefined,
			}),
		).toEqual([]);
	});

	// Regression: see issue #4398. Before this fix the fallback row was rendered
	// as a fully-synced workspace because `creationStatus` was never carried over
	// from the in-flight entry, so the sidebar dropped the "Creating…" spinner
	// during the window between host-service success and Electric delivery.
	test("propagates creationStatus='creating' from the in-flight entry", () => {
		const rows = buildCloudRowFallbackWorkspaces({
			inFlightEntries: [makeEntry({ state: "creating" })],
			hosts: [{ machineId: HOST_ID, isOnline: true }],
			localStateWorkspaceIds: new Set(),
			getWorkspaceLocalState: () => undefined,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.creationStatus).toBe("creating");
	});

	test("uses local state's sidebar fields when present", () => {
		const rows = buildCloudRowFallbackWorkspaces({
			inFlightEntries: [makeEntry()],
			hosts: [{ machineId: HOST_ID, isOnline: false }],
			localStateWorkspaceIds: new Set(),
			getWorkspaceLocalState: () => ({
				sidebarState: {
					projectId: "44444444-4444-4444-4444-444444444444",
					tabOrder: 7,
					sectionId: "55555555-5555-5555-5555-555555555555",
					isHidden: false,
				},
			}),
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.projectId).toBe("44444444-4444-4444-4444-444444444444");
		expect(rows[0]?.tabOrder).toBe(7);
		expect(rows[0]?.sectionId).toBe("55555555-5555-5555-5555-555555555555");
		expect(rows[0]?.hostIsOnline).toBe(false);
	});

	test("filters out hidden rows so they don't surface in the sidebar", () => {
		expect(
			buildCloudRowFallbackWorkspaces({
				inFlightEntries: [makeEntry()],
				hosts: [{ machineId: HOST_ID, isOnline: true }],
				localStateWorkspaceIds: new Set(),
				getWorkspaceLocalState: () => ({
					sidebarState: {
						projectId: PROJECT_ID,
						tabOrder: 0,
						sectionId: null,
						isHidden: true,
					},
				}),
			}),
		).toEqual([]);
	});
});
