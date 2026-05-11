import { describe, expect, test } from "bun:test";
import {
	type ResolveRemoteHostStatusInput,
	resolveRemoteHostStatus,
} from "./resolveRemoteHostStatus";

const MIN_VERSION = "0.8.0";

function makeInput(
	overrides: Partial<ResolveRemoteHostStatusInput> = {},
): ResolveRemoteHostStatusInput {
	return {
		workspace: { hostId: "remote-host-id" },
		machineId: "local-machine-id",
		hostsReady: true,
		hostRow: { name: "remote-host", isOnline: true },
		infoQuery: { state: "success", version: MIN_VERSION },
		minVersion: MIN_VERSION,
		...overrides,
	};
}

describe("resolveRemoteHostStatus", () => {
	test("returns loading while workspace is not yet loaded", () => {
		const status = resolveRemoteHostStatus(makeInput({ workspace: null }));
		expect(status).toEqual({ status: "loading" });
	});

	test("returns skip when workspace lives on the local machine", () => {
		const status = resolveRemoteHostStatus(
			makeInput({
				workspace: { hostId: "same-id" },
				machineId: "same-id",
			}),
		);
		expect(status).toEqual({ status: "skip" });
	});

	test("returns offline with 'Unknown host' when the host row is missing", () => {
		const status = resolveRemoteHostStatus(makeInput({ hostRow: null }));
		expect(status).toEqual({ status: "offline", hostName: "Unknown host" });
	});

	test("returns offline when cloud reports the host as not online", () => {
		const status = resolveRemoteHostStatus(
			makeInput({
				hostRow: { name: "remote-host", isOnline: false },
				infoQuery: { state: "disabled" },
			}),
		);
		expect(status).toEqual({ status: "offline", hostName: "remote-host" });
	});

	test("returns ready when host is online and version satisfies minimum", () => {
		const status = resolveRemoteHostStatus(
			makeInput({
				infoQuery: { state: "success", version: "1.2.3" },
			}),
		);
		expect(status).toEqual({ status: "ready" });
	});

	test("returns incompatible when host version is below minimum", () => {
		const status = resolveRemoteHostStatus(
			makeInput({
				infoQuery: { state: "success", version: "0.7.99" },
			}),
		);
		expect(status).toEqual({
			status: "incompatible",
			hostName: "remote-host",
			hostVersion: "0.7.99",
			minVersion: MIN_VERSION,
		});
	});

	// Repro for #4407: when cloud / `superset hosts list` reports the host
	// as online but the Desktop relay round-trip fails, the old resolver
	// returned the same `offline` shape as a legitimate isOnline=false.
	// Users see "Host is offline" with no hint that the host process is
	// running and the relay/channel is the actual broken link. The fix
	// surfaces a distinct `unreachable` status so the UI can explain it.
	describe("issue #4407 — cloud reports online, relay round-trip fails", () => {
		test("does not return the same offline status as a host that is genuinely offline", () => {
			const offlineFromCloud = resolveRemoteHostStatus(
				makeInput({
					hostRow: { name: "remote-host", isOnline: false },
					infoQuery: { state: "disabled" },
				}),
			);
			const onlineButRelayFails = resolveRemoteHostStatus(
				makeInput({
					hostRow: { name: "remote-host", isOnline: true },
					infoQuery: { state: "error" },
				}),
			);
			expect(onlineButRelayFails.status).not.toBe(offlineFromCloud.status);
		});

		test("returns unreachable (not offline) so the UI can explain the relay failure", () => {
			const status = resolveRemoteHostStatus(
				makeInput({
					hostRow: { name: "remote-host", isOnline: true },
					infoQuery: { state: "error" },
				}),
			);
			expect(status).toEqual({
				status: "unreachable",
				hostName: "remote-host",
			});
		});
	});
});
