import { describe, expect, it } from "bun:test";
import type { SelectV2Workspace } from "@superset/db/schema";
import {
	type HostWorkspaceRow,
	type HostWorkspacesQueryTarget,
	mergeHostWorkspaces,
} from "./useHostWorkspaces.utils";

function makeTarget(machineId: string): HostWorkspacesQueryTarget {
	return {
		machineId,
		organizationId: "org-1",
		hostUrl: `http://host/${machineId}`,
		isLocal: false,
	};
}

function makeHostRow(overrides: Partial<HostWorkspaceRow>): HostWorkspaceRow {
	return {
		id: "w-host",
		organizationId: "org-1",
		projectId: "p-1",
		hostId: "host-a",
		name: "host workspace",
		branch: "main",
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: new Date("2026-07-01"),
		updatedAt: new Date("2026-07-02"),
		worktreePath: "/tmp/w",
		worktreeExists: true,
		...overrides,
	};
}

// Electric rows carry ISO strings at runtime (the shape parser doesn't
// handle timestamptz), despite the SelectV2Workspace type saying Date.
function makeCloudRow(
	overrides: Partial<Record<keyof SelectV2Workspace, unknown>>,
): SelectV2Workspace {
	return {
		id: "w-cloud",
		organizationId: "org-1",
		projectId: "p-1",
		hostId: "host-b",
		name: "cloud workspace",
		branch: "main",
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt: "2026-06-01T00:00:00.000Z",
		updatedAt: "2026-06-02T00:00:00.000Z",
		...overrides,
	} as SelectV2Workspace;
}

describe("mergeHostWorkspaces", () => {
	it("converts cloud-fallback rows' string timestamps into real Dates", () => {
		const merged = mergeHostWorkspaces({
			hostResults: [],
			cloudRows: [makeCloudRow({})],
		});

		expect(merged).toHaveLength(1);
		const row = merged[0];
		expect(row?.source).toBe("cloud");
		expect(row?.createdAt).toBeInstanceOf(Date);
		expect(row?.updatedAt).toBeInstanceOf(Date);
		expect(row?.createdAt.getTime()).toBe(
			new Date("2026-06-01T00:00:00.000Z").getTime(),
		);
		expect(row?.updatedAt.getTime()).toBe(
			new Date("2026-06-02T00:00:00.000Z").getTime(),
		);
	});

	it("keeps host-served rows authoritative over cloud rows for the same host", () => {
		const target = makeTarget("host-a");
		const merged = mergeHostWorkspaces({
			hostResults: [
				{
					target,
					rows: [makeHostRow({ id: "w-1", hostId: "host-a" })],
					reachable: true,
				},
			],
			cloudRows: [
				makeCloudRow({ id: "w-stale", hostId: "host-a" }),
				makeCloudRow({ id: "w-other", hostId: "host-b" }),
			],
		});

		expect(merged.map((row) => row.id).sort()).toEqual(["w-1", "w-other"]);
		const other = merged.find((row) => row.id === "w-other");
		expect(other?.updatedAt).toBeInstanceOf(Date);
	});
});
