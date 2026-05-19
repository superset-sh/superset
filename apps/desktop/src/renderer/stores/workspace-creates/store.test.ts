import { beforeEach, describe, expect, test } from "bun:test";
import type { SelectV2Workspace } from "@superset/db/schema";
import {
	getInFlightSidebarStatus,
	type InFlightEntry,
	useWorkspaceCreatesStore,
	type WorkspacesCreateInput,
} from "./store";

const snapshot: WorkspacesCreateInput = {
	id: "ws-new",
	projectId: "project-1",
	name: "feature/x",
	branch: "feature/x",
};

const cloudRow: SelectV2Workspace = {
	id: "ws-new",
	organizationId: "org-1",
	projectId: "project-1",
	hostId: "host-1",
	name: "feature/x",
	branch: "feature/x",
	type: "worktree",
	createdByUserId: null,
	taskId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("getInFlightSidebarStatus", () => {
	const baseEntry: InFlightEntry = {
		hostId: "host-1",
		snapshot,
		state: "creating",
		startedAt: 0,
	};

	test("returns 'creating' while the workspace.create mutation is in flight", () => {
		expect(getInFlightSidebarStatus(baseEntry)).toBe("creating");
	});

	test("returns 'failed' when the entry is in error state", () => {
		expect(
			getInFlightSidebarStatus({
				...baseEntry,
				state: "error",
				error: "boom",
			}),
		).toBe("failed");
	});

	// Regression: see issue #4387 — workspaces stuck in "creating" state until refreshed.
	// Once the host-service mutation returns successfully, `markCloudRow` records the
	// canonical workspace row. Electric may take a while (or fail) to stream that row
	// into `collections.v2Workspaces`, but the sidebar should not advertise "creating"
	// once the server has confirmed the workspace.
	test("returns undefined once the cloud row is set (server confirmed)", () => {
		expect(
			getInFlightSidebarStatus({
				...baseEntry,
				cloudRow,
			}),
		).toBeUndefined();
	});
});

describe("useWorkspaceCreatesStore", () => {
	beforeEach(() => {
		useWorkspaceCreatesStore.setState({ entries: [] });
	});

	test("markCloudRow records the cloud row without clearing 'creating' state", () => {
		useWorkspaceCreatesStore.getState().add({
			hostId: "host-1",
			snapshot,
			state: "creating",
		});
		useWorkspaceCreatesStore.getState().markCloudRow(snapshot.id, cloudRow);

		const entry = useWorkspaceCreatesStore.getState().entries[0];
		expect(entry?.cloudRow).toEqual(cloudRow);
		// The raw `state` stays "creating" because the in-flight entry still acts
		// as the layout/sidebar source-of-truth until Electric delivers the synced
		// row. Sidebar derivation must use `getInFlightSidebarStatus` (which checks
		// cloudRow) rather than reading `state` directly.
		expect(entry?.state).toBe("creating");
	});

	// Regression: see issue #4387. Without consulting `cloudRow`, derivation from
	// `entry.state` alone keeps the sidebar in "creating" until Electric delivers
	// the row (or until a refresh wipes the Zustand store).
	test("sidebar status flips off 'creating' as soon as the server confirms", () => {
		useWorkspaceCreatesStore.getState().add({
			hostId: "host-1",
			snapshot,
			state: "creating",
		});
		const before = useWorkspaceCreatesStore.getState().entries[0];
		if (!before) throw new Error("expected an in-flight entry");
		expect(getInFlightSidebarStatus(before)).toBe("creating");

		useWorkspaceCreatesStore.getState().markCloudRow(snapshot.id, cloudRow);
		const after = useWorkspaceCreatesStore.getState().entries[0];
		if (!after) throw new Error("expected the in-flight entry to remain");
		expect(getInFlightSidebarStatus(after)).toBeUndefined();
	});
});
