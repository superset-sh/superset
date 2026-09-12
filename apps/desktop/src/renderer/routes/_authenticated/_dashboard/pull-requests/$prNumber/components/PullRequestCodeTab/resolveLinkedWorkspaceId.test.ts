import { describe, expect, test } from "bun:test";
import {
	liveWorkspaceIdsForHost,
	resolveLinkedWorkspaceId,
} from "./resolveLinkedWorkspaceId";

describe("resolveLinkedWorkspaceId", () => {
	test("has nothing to resolve before the link answers", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: undefined,
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: null,
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
	});

	test("keeps an id the mirror still lists", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: new Set(["ws-1", "ws-2"]),
			}),
		).toBe("ws-1");
	});

	test("drops an archived id: the mirror settled without it", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: new Set(["ws-2"]),
			}),
		).toBeNull();
	});

	test("keeps the id when the host reported nothing", () => {
		// Dropping it here would create the second PR checkout the seeded id
		// exists to prevent.
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: null,
			}),
		).toBe("ws-1");
	});
});

describe("liveWorkspaceIdsForHost", () => {
	const workspaces = [
		{ id: "ws-1", hostId: "host-1" },
		{ id: "ws-2", hostId: "host-1" },
		{ id: "ws-3", hostId: "host-2" },
	];

	test("reports only the workspaces the host itself answered with", () => {
		expect(
			liveWorkspaceIdsForHost({
				hostId: "host-1",
				workspaces,
				answeredHostIds: new Set(["host-1", "host-2"]),
			}),
		).toEqual(new Set(["ws-1", "ws-2"]));
	});

	test("reports nothing from a host whose list errored", () => {
		// The failed list leaves no rows behind, and reading that as "every
		// workspace is gone" throws away the id the create path just wrote.
		expect(
			liveWorkspaceIdsForHost({
				hostId: "host-1",
				workspaces: [],
				answeredHostIds: new Set(["host-2"]),
			}),
		).toBeNull();
	});

	test("reports nothing before the host has answered", () => {
		expect(
			liveWorkspaceIdsForHost({
				hostId: "host-1",
				workspaces,
				answeredHostIds: new Set(),
			}),
		).toBeNull();
	});

	test("reports nothing before the host resolves", () => {
		expect(
			liveWorkspaceIdsForHost({
				hostId: null,
				workspaces,
				answeredHostIds: new Set(["host-1"]),
			}),
		).toBeNull();
	});

	test("an answering host with no workspaces left does prove an id gone", () => {
		const liveWorkspaceIds = liveWorkspaceIdsForHost({
			hostId: "host-1",
			workspaces: [],
			answeredHostIds: new Set(["host-1"]),
		});
		expect(liveWorkspaceIds).toEqual(new Set());
		expect(
			resolveLinkedWorkspaceId({ workspaceId: "ws-1", liveWorkspaceIds }),
		).toBeNull();
	});
});
