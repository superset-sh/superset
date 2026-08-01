import { describe, expect, it } from "bun:test";
import {
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
	});

	it("isolates hydrated snapshots by organization", () => {
		expect(getHostWorkspacesSnapshotCacheKey("org-a", "machine-1")).not.toBe(
			getHostWorkspacesSnapshotCacheKey("org-b", "machine-1"),
		);
	});
});
