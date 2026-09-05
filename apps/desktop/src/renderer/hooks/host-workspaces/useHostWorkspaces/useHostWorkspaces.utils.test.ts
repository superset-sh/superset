import { describe, expect, it } from "bun:test";
import type { WorkspaceSnapshotPayload } from "@superset/workspace-client";
import {
	applyWorkspaceChangedEvent,
	type HostWorkspaceItem,
	isEventBusReopen,
	mergeHostWorkspaces,
	splitShelvedWorkspaces,
	toHostWorkspaceItem,
} from "./useHostWorkspaces.utils";

const HOST = { organizationId: "org-1", machineId: "machine-1" };

function makeSnapshot(
	overrides: Partial<WorkspaceSnapshotPayload> & { id: string },
): WorkspaceSnapshotPayload {
	return {
		projectId: "project-1",
		name: overrides.id,
		branch: overrides.id,
		type: "worktree",
		worktreePath: `/tmp/${overrides.id}`,
		taskId: null,
		createdByUserId: null,
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		lastActivityAt: 1_700_000_050_000,
		shelvedAt: null,
		tags: [],
		...overrides,
	};
}

describe("isEventBusReopen", () => {
	it("treats any open after the first as a reopen", () => {
		expect(isEventBusReopen(true, "open")).toBe(true);
	});

	it("does not treat the first open as a reopen", () => {
		expect(isEventBusReopen(false, "open")).toBe(false);
	});

	it("ignores transitions that do not land on open", () => {
		expect(isEventBusReopen(true, "reconnecting")).toBe(false);
		expect(isEventBusReopen(true, "closed")).toBe(false);
		expect(isEventBusReopen(true, "connecting")).toBe(false);
	});
});

describe("applyWorkspaceChangedEvent lastActivityAt", () => {
	it("carries the snapshot's lastActivityAt onto the cached row", () => {
		const rows = applyWorkspaceChangedEvent(
			undefined,
			{ eventType: "created", workspace: makeSnapshot({ id: "w1" }) },
			HOST,
			"w1",
		);
		expect(rows?.[0]?.lastActivityAt).toBe(1_700_000_050_000);
	});

	it("replaces a stale value on update", () => {
		const initial = applyWorkspaceChangedEvent(
			undefined,
			{ eventType: "created", workspace: makeSnapshot({ id: "w1" }) },
			HOST,
			"w1",
		);
		const updated = applyWorkspaceChangedEvent(
			initial,
			{
				eventType: "updated",
				workspace: makeSnapshot({
					id: "w1",
					lastActivityAt: 1_700_000_999_000,
				}),
			},
			HOST,
			"w1",
		);
		expect(updated?.[0]?.lastActivityAt).toBe(1_700_000_999_000);
	});

	it("normalizes an older host's event (no field) to null", () => {
		// Runtime shape from a host-service that predates the column.
		const legacy = makeSnapshot({ id: "w1" }) as unknown as Record<
			string,
			unknown
		>;
		delete legacy.lastActivityAt;
		const rows = applyWorkspaceChangedEvent(
			undefined,
			{
				eventType: "created",
				workspace: legacy as unknown as WorkspaceSnapshotPayload,
			},
			HOST,
			"w1",
		);
		expect(rows?.[0]?.lastActivityAt).toBeNull();
	});

	it("keeps the cached stamp when an older host's update omits the field", () => {
		const initial = applyWorkspaceChangedEvent(
			undefined,
			{ eventType: "created", workspace: makeSnapshot({ id: "w1" }) },
			HOST,
			"w1",
		);
		const legacy = makeSnapshot({ id: "w1" }) as unknown as Record<
			string,
			unknown
		>;
		delete legacy.lastActivityAt;
		const updated = applyWorkspaceChangedEvent(
			initial,
			{
				eventType: "updated",
				workspace: legacy as unknown as WorkspaceSnapshotPayload,
			},
			HOST,
			"w1",
		);
		expect(updated?.[0]?.lastActivityAt).toBe(1_700_000_050_000);
	});
});

describe("toHostWorkspaceItem", () => {
	const [row] =
		applyWorkspaceChangedEvent(
			undefined,
			{ eventType: "created", workspace: makeSnapshot({ id: "w1" }) },
			HOST,
			"w1",
		) ?? [];
	if (!row) throw new Error("expected a row");

	it("keeps a served lastActivityAt", () => {
		expect(toHostWorkspaceItem(row, true).lastActivityAt).toBe(
			1_700_000_050_000,
		);
	});

	it("normalizes a row cached before the column existed to null", () => {
		const { lastActivityAt: _omitted, ...cachedBeforeColumn } = row;
		expect(toHostWorkspaceItem(cachedBeforeColumn, true).lastActivityAt).toBe(
			null,
		);
	});

	it("is what mergeHostWorkspaces produces", () => {
		const { lastActivityAt: _omitted, ...cachedBeforeColumn } = row;
		const [item] = mergeHostWorkspaces({
			hostResults: [
				{
					target: { ...HOST, hostUrl: "http://localhost:1", isLocal: true },
					rows: [cachedBeforeColumn],
					reachable: false,
				},
			],
		});
		expect(item).toMatchObject({
			id: "w1",
			lastActivityAt: null,
			hostReachable: false,
		});
	});
});

describe("applyWorkspaceChangedEvent shelvedAt", () => {
	const SHELVED_AT = 1_700_000_100_000;

	it("carries the snapshot's shelvedAt onto the cached row", () => {
		const rows = applyWorkspaceChangedEvent(
			undefined,
			{
				eventType: "updated",
				workspace: makeSnapshot({ id: "w1", shelvedAt: SHELVED_AT }),
			},
			HOST,
			"w1",
		);
		expect(rows?.[0]?.shelvedAt).toBe(SHELVED_AT);
	});

	it("clears the flag when an unarchive broadcasts shelvedAt: null", () => {
		// The `??` idiom used for older-host omissions would keep the row
		// archived forever here; null is a real value and must win.
		const archived = applyWorkspaceChangedEvent(
			undefined,
			{
				eventType: "updated",
				workspace: makeSnapshot({ id: "w1", shelvedAt: SHELVED_AT }),
			},
			HOST,
			"w1",
		);
		const restored = applyWorkspaceChangedEvent(
			archived,
			{
				eventType: "updated",
				workspace: makeSnapshot({ id: "w1", shelvedAt: null }),
			},
			HOST,
			"w1",
		);
		expect(restored?.[0]?.shelvedAt).toBeNull();
	});

	it("keeps the cached flag when an older host's event omits the field", () => {
		const archived = applyWorkspaceChangedEvent(
			undefined,
			{
				eventType: "updated",
				workspace: makeSnapshot({ id: "w1", shelvedAt: SHELVED_AT }),
			},
			HOST,
			"w1",
		);
		const { shelvedAt: _omitted, ...legacySnapshot } = makeSnapshot({
			id: "w1",
		});
		const next = applyWorkspaceChangedEvent(
			archived,
			{
				eventType: "updated",
				workspace: legacySnapshot as WorkspaceSnapshotPayload,
			},
			HOST,
			"w1",
		);
		expect(next?.[0]?.shelvedAt).toBe(SHELVED_AT);
	});

	it("defaults a brand-new row without the field to null", () => {
		const { shelvedAt: _omitted, ...legacySnapshot } = makeSnapshot({
			id: "w1",
		});
		const rows = applyWorkspaceChangedEvent(
			undefined,
			{
				eventType: "created",
				workspace: legacySnapshot as WorkspaceSnapshotPayload,
			},
			HOST,
			"w1",
		);
		expect(rows?.[0]?.shelvedAt).toBeNull();
	});
});

describe("splitShelvedWorkspaces", () => {
	function makeItem(id: string, shelvedAt: number | null): HostWorkspaceItem {
		return {
			id,
			organizationId: HOST.organizationId,
			projectId: "project-1",
			hostId: HOST.machineId,
			name: id,
			branch: id,
			type: "worktree",
			createdByUserId: null,
			taskId: null,
			createdAt: new Date(1_700_000_000_000),
			updatedAt: new Date(1_700_000_000_000),
			lastActivityAt: null,
			hostReachable: true,
			shelvedAt,
		};
	}

	it("partitions by the flag, preserving order within each side", () => {
		const { workspaces, shelvedWorkspaces } = splitShelvedWorkspaces([
			makeItem("live-1", null),
			makeItem("shelved-1", 10),
			makeItem("live-2", null),
			makeItem("shelved-2", 20),
		]);
		expect(workspaces.map((w) => w.id)).toEqual(["live-1", "live-2"]);
		expect(shelvedWorkspaces.map((w) => w.id)).toEqual([
			"shelved-1",
			"shelved-2",
		]);
	});

	it("treats a zero timestamp as archived and null as live", () => {
		const { workspaces, shelvedWorkspaces } = splitShelvedWorkspaces([
			makeItem("epoch", 0),
			makeItem("live", null),
		]);
		expect(shelvedWorkspaces.map((w) => w.id)).toEqual(["epoch"]);
		expect(workspaces.map((w) => w.id)).toEqual(["live"]);
	});
});

describe("toHostWorkspaceItem shelvedAt", () => {
	it("normalizes an absent flag to null", () => {
		const item = toHostWorkspaceItem(
			{
				id: "w1",
				organizationId: HOST.organizationId,
				projectId: "project-1",
				hostId: HOST.machineId,
				name: "w1",
				branch: "w1",
				type: "worktree",
				createdByUserId: null,
				taskId: null,
				createdAt: new Date(0),
				updatedAt: new Date(0),
				worktreePath: "/tmp/w1",
				worktreeExists: true,
			},
			true,
		);
		expect(item.shelvedAt).toBeNull();
	});
});
