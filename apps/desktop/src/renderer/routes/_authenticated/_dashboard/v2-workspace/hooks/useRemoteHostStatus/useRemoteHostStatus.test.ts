import { describe, expect, it } from "bun:test";
import { deriveRemoteHostStatus } from "./useRemoteHostStatus";

const baseInput = {
	workspaceExists: true,
	isLocal: false,
	hostId: "host-1",
	hostName: "Build Mac",
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

	it("keeps loading while probing a host that cloud presence marked offline", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				infoState: "idle",
			}),
		).toEqual({
			status: "loading",
		});
	});

	it("allows a reachable host even when cloud presence is stale offline", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				infoState: "success",
			}),
		).toEqual({
			status: "ready",
		});
	});

	it("shows offline when a host probe fails", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				infoState: "error",
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

	it("allows a reachable host even before host metadata resolves", () => {
		expect(
			deriveRemoteHostStatus({
				...baseInput,
				hostName: null,
				infoState: "success",
			}),
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
