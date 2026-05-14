import { describe, expect, test } from "bun:test";
import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import { getRemoteHostStatus } from "./remoteHostStatusPolicy";

const baseRemoteInput = {
	workspacePresent: true,
	localMachineReady: true,
	isLocal: false,
	liveQueryReady: true,
	hostName: "Town-Hall",
	hostIsOnline: true,
	hostInfoStatus: "success" as const,
	hostVersion: MIN_HOST_SERVICE_VERSION,
};

describe("getRemoteHostStatus", () => {
	test("waits until the workspace, local host id, and host row are ready", () => {
		expect(
			getRemoteHostStatus({ ...baseRemoteInput, workspacePresent: false }),
		).toEqual({ status: "loading" });
		expect(
			getRemoteHostStatus({ ...baseRemoteInput, localMachineReady: false }),
		).toEqual({ status: "loading" });
		expect(
			getRemoteHostStatus({ ...baseRemoteInput, liveQueryReady: false }),
		).toEqual({ status: "loading" });
	});

	test("skips remote checks for the local host", () => {
		expect(getRemoteHostStatus({ ...baseRemoteInput, isLocal: true })).toEqual({
			status: "skip",
		});
	});

	test("blocks offline and unreachable remote hosts before mounting a workspace", () => {
		expect(
			getRemoteHostStatus({ ...baseRemoteInput, hostIsOnline: false }),
		).toEqual({
			status: "unavailable",
			hostName: "Town-Hall",
			reason: "offline",
		});
		expect(
			getRemoteHostStatus({
				...baseRemoteInput,
				hostInfoStatus: "error",
				hostVersion: undefined,
			}),
		).toEqual({
			status: "unavailable",
			hostName: "Town-Hall",
			reason: "unreachable",
		});
	});

	test("waits while remote host info is still pending", () => {
		expect(
			getRemoteHostStatus({
				...baseRemoteInput,
				hostInfoStatus: "pending",
				hostVersion: undefined,
			}),
		).toEqual({ status: "loading" });
	});

	test("reports incompatible host versions", () => {
		expect(
			getRemoteHostStatus({ ...baseRemoteInput, hostVersion: "0.0.0" }),
		).toEqual({
			status: "incompatible",
			hostName: "Town-Hall",
			hostVersion: "0.0.0",
			minVersion: MIN_HOST_SERVICE_VERSION,
		});
	});

	test("allows compatible online remote hosts", () => {
		expect(getRemoteHostStatus(baseRemoteInput)).toEqual({ status: "ready" });
	});
});
