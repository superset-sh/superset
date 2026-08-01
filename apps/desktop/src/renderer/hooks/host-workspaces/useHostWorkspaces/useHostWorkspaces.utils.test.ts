import { describe, expect, it } from "bun:test";
import {
	areHostWorkspaceQueriesAuthoritative,
	getHostWorkspacesQueryKey,
	getHostWorkspacesSnapshotCacheKey,
} from "./useHostWorkspaces.utils";

describe("host workspace cache keys", () => {
	it("isolates React Query entries by organization", () => {
		const target = {
			organizationId: "org-a",
			machineId: "machine-1",
			hostUrl: "http://127.0.0.1:1234",
		};

		expect(getHostWorkspacesQueryKey(target)).not.toEqual(
			getHostWorkspacesQueryKey({ ...target, organizationId: "org-b" }),
		);
		expect(getHostWorkspacesQueryKey(target)).not.toEqual(
			getHostWorkspacesQueryKey({ ...target, machineId: "machine-2" }),
		);
	});

	it("isolates hydrated snapshots by organization", () => {
		expect(getHostWorkspacesSnapshotCacheKey("org-a", "machine-1")).not.toBe(
			getHostWorkspacesSnapshotCacheKey("org-b", "machine-1"),
		);
		expect(getHostWorkspacesSnapshotCacheKey("org-a", "machine-1")).not.toBe(
			getHostWorkspacesSnapshotCacheKey("org-a", "machine-2"),
		);
	});

	it("requires a successful live query from every known host", () => {
		expect(areHostWorkspaceQueriesAuthoritative(true, 2, [true, true])).toBe(
			true,
		);
		expect(areHostWorkspaceQueriesAuthoritative(true, 2, [true, false])).toBe(
			false,
		);
		expect(areHostWorkspaceQueriesAuthoritative(false, 2, [true, true])).toBe(
			false,
		);
		expect(areHostWorkspaceQueriesAuthoritative(true, 0, [])).toBe(false);
	});
});
