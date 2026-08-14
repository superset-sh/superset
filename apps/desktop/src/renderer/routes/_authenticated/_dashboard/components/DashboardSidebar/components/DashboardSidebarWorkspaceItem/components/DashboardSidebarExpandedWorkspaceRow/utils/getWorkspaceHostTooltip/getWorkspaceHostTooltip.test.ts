import { describe, expect, it } from "bun:test";
import {
	getWorkspaceHostTooltip,
	type WorkspaceHostTooltipInput,
} from "./getWorkspaceHostTooltip";

const remote: WorkspaceHostTooltipInput = {
	hostType: "remote-device",
	workspaceType: "worktree",
	hostIsOnline: true,
	hostName: "OCI Ralu",
};

describe("getWorkspaceHostTooltip", () => {
	it("names the host a remote workspace runs on", () => {
		expect(getWorkspaceHostTooltip(remote)).toEqual({
			title: "Remote workspace",
			description: "Running on OCI Ralu",
		});
	});

	it("tells two remote hosts apart", () => {
		const first = getWorkspaceHostTooltip(remote);
		const second = getWorkspaceHostTooltip({ ...remote, hostName: "Jaz PC-1" });

		expect(first.description).not.toBe(second.description);
	});

	it("names the host in the offline description", () => {
		expect(getWorkspaceHostTooltip({ ...remote, hostIsOnline: false })).toEqual(
			{
				title: "Remote workspace — device offline",
				description: "OCI Ralu isn't reachable right now",
			},
		);
	});

	it("names the host a remote main workspace is checked out on", () => {
		expect(
			getWorkspaceHostTooltip({ ...remote, workspaceType: "main" }),
		).toEqual({
			title: "Main workspace",
			description: "Uses the repository checkout on OCI Ralu",
		});
	});

	it("falls back to generic copy when the host name is unknown", () => {
		expect(getWorkspaceHostTooltip({ ...remote, hostName: null })).toEqual({
			title: "Remote workspace",
			description: "Running on a paired device",
		});
		expect(
			getWorkspaceHostTooltip({
				...remote,
				hostName: null,
				hostIsOnline: false,
			}).description,
		).toBe("The associated device isn't reachable right now");
		expect(
			getWorkspaceHostTooltip({
				...remote,
				hostName: null,
				workspaceType: "main",
			}).description,
		).toBe("Uses the repository checkout on this host");
	});

	it("keeps local copy device-relative", () => {
		expect(
			getWorkspaceHostTooltip({
				...remote,
				hostType: "local-device",
				hostIsOnline: null,
			}),
		).toEqual({
			title: "Local workspace",
			description: "Running on this device",
		});
	});

	it("keeps cloud copy unchanged", () => {
		expect(
			getWorkspaceHostTooltip({
				...remote,
				hostType: "cloud",
				hostIsOnline: null,
			}),
		).toEqual({
			title: "Cloud workspace",
			description: "Hosted in the cloud",
		});
	});
});
