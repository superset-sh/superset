import { describe, expect, it } from "bun:test";
import {
	derivePullRequestQueryTargets,
	getDashboardSidebarPullRequestQueryKey,
	type PullRequestQueryTarget,
} from "./derivePullRequestQueryTargets";

const MACHINE_ID = "machine-local";
const LOCAL_HOST_URL = "http://127.0.0.1:5900";
const RELAY_URL = "https://relay.example.com";

function makeTarget(
	overrides: Partial<PullRequestQueryTarget> = {},
): PullRequestQueryTarget {
	return {
		organizationId: "org-1",
		machineId: MACHINE_ID,
		hostType: "local-device",
		hostUrl: LOCAL_HOST_URL,
		workspaceIds: ["ws-1", "ws-2"],
		...overrides,
	};
}

describe("getDashboardSidebarPullRequestQueryKey", () => {
	it("is stable across workspace membership changes on the same host", () => {
		// Deleting/hiding/pinning a workspace must not mint a new query key —
		// a new key discards cached PR data for every workspace on the host
		// and refetches the whole batch.
		const before = getDashboardSidebarPullRequestQueryKey(
			makeTarget({ workspaceIds: ["ws-1", "ws-2", "ws-3"] }),
		);
		const after = getDashboardSidebarPullRequestQueryKey(
			makeTarget({ workspaceIds: ["ws-1", "ws-3"] }),
		);
		expect(after).toEqual(before);
	});

	it("is stable across host URL changes on the same host", () => {
		// The local host-service port moves on restarts; routing must not be
		// identity or every port change cold-starts the whole PR-chip cache.
		const before = getDashboardSidebarPullRequestQueryKey(
			makeTarget({ hostUrl: "http://127.0.0.1:51507" }),
		);
		const after = getDashboardSidebarPullRequestQueryKey(
			makeTarget({ hostUrl: "http://127.0.0.1:53875" }),
		);
		expect(after).toEqual(before);
	});

	it("differs across hosts and across orgs on the same machine", () => {
		const local = getDashboardSidebarPullRequestQueryKey(makeTarget());
		const remote = getDashboardSidebarPullRequestQueryKey(
			makeTarget({
				machineId: "machine-remote",
				hostType: "remote-device",
				hostUrl: `${RELAY_URL}/hosts/org:machine-remote`,
			}),
		);
		const otherOrg = getDashboardSidebarPullRequestQueryKey(
			makeTarget({ organizationId: "org-2" }),
		);
		expect(remote).not.toEqual(local);
		expect(otherOrg).not.toEqual(local);
	});
});

describe("derivePullRequestQueryTargets", () => {
	it("groups workspaces by host with sorted ids", () => {
		const targets = derivePullRequestQueryTargets({
			activeHostUrl: LOCAL_HOST_URL,
			hosts: [
				{ organizationId: "org-1", machineId: MACHINE_ID, isOnline: true },
			],
			machineId: MACHINE_ID,
			relayUrl: RELAY_URL,
			workspaces: [
				{ id: "ws-b", hostId: MACHINE_ID },
				{ id: "ws-a", hostId: MACHINE_ID },
			],
		});
		expect(targets).toHaveLength(1);
		expect(targets[0]?.workspaceIds).toEqual(["ws-a", "ws-b"]);
		expect(targets[0]?.hostUrl).toBe(LOCAL_HOST_URL);
	});

	it("keeps the local target with a null URL while the host-service is down", () => {
		// The target must survive the outage so the query stays mounted and
		// cached chips keep rendering — dropping it unmounts the query and
		// blanks every chip for the duration of the restart.
		const targets = derivePullRequestQueryTargets({
			activeHostUrl: null,
			hosts: [
				{ organizationId: "org-1", machineId: MACHINE_ID, isOnline: true },
			],
			machineId: MACHINE_ID,
			relayUrl: RELAY_URL,
			workspaces: [{ id: "ws-1", hostId: MACHINE_ID }],
		});
		expect(targets).toHaveLength(1);
		expect(targets[0]?.hostUrl).toBeNull();
		expect(targets[0]?.machineId).toBe(MACHINE_ID);
	});

	it("omits offline remote hosts", () => {
		const targets = derivePullRequestQueryTargets({
			activeHostUrl: LOCAL_HOST_URL,
			hosts: [
				{
					organizationId: "org-1",
					machineId: "machine-remote",
					isOnline: false,
				},
			],
			machineId: MACHINE_ID,
			relayUrl: RELAY_URL,
			workspaces: [{ id: "ws-r", hostId: "machine-remote" }],
		});
		expect(targets).toHaveLength(0);
	});
});
