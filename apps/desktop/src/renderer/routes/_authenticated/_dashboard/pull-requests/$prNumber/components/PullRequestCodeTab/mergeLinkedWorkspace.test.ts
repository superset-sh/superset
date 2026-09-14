import { describe, expect, test } from "bun:test";
import {
	mergeLinkedWorkspace,
	reconcileCachedLinkedWorkspace,
} from "./mergeLinkedWorkspace";

describe("mergeLinkedWorkspace", () => {
	test("takes the host's link when it has one", () => {
		expect(mergeLinkedWorkspace(undefined, { workspaceId: "ws-1" })).toEqual({
			workspaceId: "ws-1",
		});
	});

	test("keeps a seeded id when the host has not linked it yet", () => {
		// The refetch after the 30s staleness window is where the seed used to
		// die: the host answers null, the next send creates a second checkout.
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: "ws-1", seeded: true },
				{ workspaceId: null },
			),
		).toEqual({ workspaceId: "ws-1", seeded: true });
	});

	test("lets the host's own link replace a seeded id", () => {
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: "ws-1", seeded: true },
				{ workspaceId: "ws-2" },
			),
		).toEqual({ workspaceId: "ws-2" });
	});

	test("does not resurrect an id the host itself had answered", () => {
		expect(
			mergeLinkedWorkspace({ workspaceId: "ws-1" }, { workspaceId: null }),
		).toEqual({ workspaceId: null });
	});

	test("carries nothing forward from an empty seed", () => {
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: null, seeded: true },
				{ workspaceId: null },
			),
		).toEqual({ workspaceId: null });
	});
});

describe("reconcileCachedLinkedWorkspace", () => {
	test("records the first list the workspace appears in", () => {
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: "ws-1", seeded: true },
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toEqual({ workspaceId: "ws-1", seeded: true, listed: true });
	});

	test("writes nothing once the workspace is already recorded", () => {
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: "ws-1", seeded: true, listed: true },
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
	});

	test("retires an id the host listed before and no longer lists", () => {
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: "ws-1", seeded: true, listed: true },
				liveWorkspaceIds: new Set(["ws-2"]),
			}),
		).toEqual({ workspaceId: null });
	});

	test("waits for a workspace the host has never listed", () => {
		// A create the host answered with a different canonical id has no row
		// until the host broadcasts it; retiring here checks the PR out twice.
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: "ws-1", seeded: true },
				liveWorkspaceIds: new Set(),
			}),
		).toBeNull();
	});

	test("writes nothing while the host is reporting nothing", () => {
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: "ws-1", seeded: true, listed: true },
				liveWorkspaceIds: null,
			}),
		).toBeNull();
	});

	test("has nothing to reconcile without a cached id", () => {
		expect(
			reconcileCachedLinkedWorkspace({
				cached: undefined,
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
		expect(
			reconcileCachedLinkedWorkspace({
				cached: { workspaceId: null },
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
	});
});
