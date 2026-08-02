import { describe, expect, it } from "bun:test";
import { type KnownHostRow, resolveKnownHosts } from "./useKnownHosts.utils";

const ORG = "org-1";

function makeHost(overrides: Partial<KnownHostRow> = {}): KnownHostRow {
	return {
		organizationId: ORG,
		machineId: "machine-a",
		isOnline: true,
		...overrides,
	};
}

describe("resolveKnownHosts", () => {
	it("serves the snapshot when Electric is empty and not ready", () => {
		// The failure this guards: an Electric flicker (resync, cold start)
		// returning [] must not empty the host target list — that clears every
		// host-derived sidebar row.
		const snapshot = [makeHost(), makeHost({ machineId: "machine-b" })];
		expect(resolveKnownHosts([], snapshot, false)).toEqual(snapshot);
	});

	it("treats a ready-but-empty live list as authoritative", () => {
		// Deleting an org's last host must clear the sidebar — the snapshot
		// must not resurrect it as a ghost.
		const snapshot = [makeHost()];
		expect(resolveKnownHosts([], snapshot, true)).toEqual([]);
	});

	it("prefers live rows outright when Electric serves data", () => {
		const live = [makeHost({ isOnline: false })];
		const snapshot = [
			makeHost({ isOnline: true }),
			makeHost({ machineId: "deleted-host" }),
		];
		// No row-level merge: a host deleted from the org must not be
		// resurrected from a stale snapshot. Rows count even before isReady —
		// Electric serves persisted rows on offline cold starts without ever
		// reaching ready (cache-first rule).
		expect(resolveKnownHosts(live, snapshot, false)).toEqual(live);
		expect(resolveKnownHosts(live, snapshot, true)).toEqual(live);
	});

	it("returns empty when both sources are empty", () => {
		expect(resolveKnownHosts([], undefined, false)).toEqual([]);
		expect(resolveKnownHosts([], [], true)).toEqual([]);
	});
});
