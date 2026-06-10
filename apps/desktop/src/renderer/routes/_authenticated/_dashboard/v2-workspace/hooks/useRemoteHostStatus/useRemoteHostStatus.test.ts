import { describe, expect, it } from "bun:test";
import { deriveRemoteHostStatus } from "./useRemoteHostStatus";

const baseInput = {
	workspaceExists: true,
	isLocal: false,
	hostId: "host-1",
	hostName: "Build Mac",
	hostRowsReady: true,
	hostIsOnline: true,
	infoState: "success" as const,
	hostVersion: "99.0.0",
	minVersion: "1.0.0",
};

describe("deriveRemoteHostStatus", () => {
	it("skips local workspaces", () => {
		expect(deriveRemoteHostStatus({ ...baseInput, isLocal: true })).toEqual({
			status: "skip",
		});
	});

	it("shows offline when cloud presence says the host is offline", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				hostIsOnline: false,
				infoState: "idle",
			}),
		).toEqual({
			status: "offline",
			hostId: "host-1",
			hostName: "Build Mac",
		});
	});

	it("shows offline when relay host.info cannot be reached", () => {
		expect(
			deriveRemoteHostStatus({ ...baseInput, infoState: "error" }),
		).toEqual({
			status: "offline",
			hostId: "host-1",
			hostName: "Build Mac",
		});
	});

	it("blocks on loading while the remote host probe is pending", () => {
		expect(
			deriveRemoteHostStatus({ ...baseInput, infoState: "pending" }),
		).toEqual({
			status: "loading",
		});
	});

	it("allows a reachable host even before host collection readiness settles", () => {
		expect(
			deriveRemoteHostStatus({ ...baseInput, hostRowsReady: false }),
		).toEqual({
			status: "ready",
		});
	});

	it("reports incompatible remote hosts", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				hostVersion: "0.5.0",
				minVersion: "1.0.0",
			}),
		).toEqual({
			status: "incompatible",
			hostName: "Build Mac",
			hostVersion: "0.5.0",
			minVersion: "1.0.0",
		});
	});
});
