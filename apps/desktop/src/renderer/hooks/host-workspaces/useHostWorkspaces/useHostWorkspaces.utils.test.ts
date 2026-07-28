import { describe, expect, it } from "bun:test";
import type { SelectV2Workspace } from "@superset/db/schema";
import type { WorkspaceSnapshotPayload } from "@superset/workspace-client";
import {
	applyWorkspaceChangedEvent,
	type HostWorkspaceRow,
	mergeHostWorkspaces,
} from "./useHostWorkspaces.utils";

const HOST = { organizationId: "org-1", machineId: "host-1" };

function makeSnapshot(
	overrides: Partial<WorkspaceSnapshotPayload> = {},
): WorkspaceSnapshotPayload {
	return {
		id: "ws-1",
		projectId: "project-1",
		name: "Feature",
		branch: "feature",
		type: "worktree" as const,
		worktreePath: "/tmp/worktree",
		taskId: null,
		createdByUserId: null,
		createdAt: 1_000,
		updatedAt: 2_000,
		archivedAt: null as number | null,
		...overrides,
	};
}

function makeRow(overrides: Partial<HostWorkspaceRow> = {}): HostWorkspaceRow {
	return {
		id: "ws-1",
		organizationId: HOST.organizationId,
		projectId: "project-1",
		hostId: HOST.machineId,
		name: "Feature",
		branch: "feature",
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: new Date(1_000),
		updatedAt: new Date(2_000),
		worktreePath: "/tmp/worktree",
		worktreeExists: true,
		archivedAt: null,
		...overrides,
	};
}

describe("applyWorkspaceChangedEvent", () => {
	it("carries archivedAt from the snapshot into the cached row", () => {
		const archivedAtMs = 5_000;
		const next = applyWorkspaceChangedEvent(
			[makeRow()],
			{
				eventType: "updated",
				workspace: makeSnapshot({ archivedAt: archivedAtMs }),
			},
			HOST,
			"ws-1",
		);
		expect(next?.[0]?.archivedAt?.getTime()).toBe(archivedAtMs);
	});

	it("preserves projectName across broadcasts (snapshots don't carry it)", () => {
		const next = applyWorkspaceChangedEvent(
			[makeRow({ projectName: "superset" })],
			{
				eventType: "updated",
				workspace: makeSnapshot({ archivedAt: 5_000 }),
			},
			HOST,
			"ws-1",
		);
		expect(next?.[0]?.projectName).toBe("superset");
	});

	it("clears archivedAt when the snapshot reports null (unarchive)", () => {
		const next = applyWorkspaceChangedEvent(
			[makeRow({ archivedAt: new Date(5_000) })],
			{ eventType: "updated", workspace: makeSnapshot({ archivedAt: null }) },
			HOST,
			"ws-1",
		);
		expect(next?.[0]?.archivedAt).toBeNull();
	});
});

describe("mergeHostWorkspaces", () => {
	it("keeps archivedAt on host rows and defaults cloud-fallback rows to null", () => {
		const archived = makeRow({ id: "ws-1", archivedAt: new Date(5_000) });
		const cloudRow = {
			id: "ws-2",
			organizationId: "org-1",
			projectId: "project-1",
			hostId: "host-2",
			name: "Cloud only",
			branch: "cloud-only",
			type: "worktree",
			createdByUserId: null,
			taskId: null,
			createdAt: new Date(1_000),
			updatedAt: new Date(2_000),
		} as SelectV2Workspace;

		const merged = mergeHostWorkspaces({
			hostResults: [
				{
					target: {
						machineId: HOST.machineId,
						organizationId: HOST.organizationId,
						hostUrl: "http://localhost:1",
						isLocal: true,
					},
					rows: [archived],
					reachable: true,
				},
			],
			cloudRows: [cloudRow],
		});

		const hostItem = merged.find((item) => item.id === "ws-1");
		const cloudItem = merged.find((item) => item.id === "ws-2");
		expect(hostItem?.archivedAt?.getTime()).toBe(5_000);
		expect(cloudItem?.archivedAt).toBeNull();
		expect(cloudItem?.source).toBe("cloud");
	});
});
