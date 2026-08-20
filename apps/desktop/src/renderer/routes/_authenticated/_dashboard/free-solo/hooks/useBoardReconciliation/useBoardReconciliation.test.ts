import { describe, expect, it } from "bun:test";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import type { BoardCard } from "renderer/stores/free-solo-board";
import { computeMissingCards } from "./useBoardReconciliation";

const HOST_A = "http://host-a";

function card(overrides: Partial<BoardCard> = {}): BoardCard {
	return {
		id: "card-1",
		workspaceId: "ws-1",
		terminalId: "term-1",
		x: 0,
		y: 0,
		w: 640,
		h: 420,
		z: 0,
		...overrides,
	};
}

function workspace(
	overrides: Partial<HostWorkspaceItem> = {},
): HostWorkspaceItem {
	return {
		id: "ws-1",
		hostId: "host-a-id",
		hostReachable: true,
		name: "ws-1",
		type: "main",
		projectId: null,
		// Fields beyond what reconciliation reads are irrelevant to the
		// decision — cast rather than filling out the whole schema.
		...overrides,
	} as HostWorkspaceItem;
}

// A resolver that only knows about HOST_A, keyed by the workspace's hostId.
const resolveHostUrl = (hostId: string) =>
	hostId === "host-a-id" ? HOST_A : null;

describe("computeMissingCards", () => {
	it("returns no verdict at all when hosts have not settled — not even an empty map", () => {
		const result = computeMissingCards({
			hostsSettled: false,
			isReady: true,
			cards: [card()],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-1"]) },
			resolveHostUrl,
		});
		// null, not {}: the caller must skip calling setMissing entirely, or a
		// transient not-settled render would clear real missing flags.
		expect(result).toBeNull();
	});

	it("leaves a card untouched when its host has not reported yet", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			workspaces: [workspace()],
			// HOST_A absent entirely — silence, not evidence.
			sessionsByHost: {},
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({});
	});

	it("leaves a card untouched when its host has no resolvable URL", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-1"]) },
			resolveHostUrl: () => null,
		});
		expect(result?.missing).toEqual({});
	});

	it('marks "workspace" when the card\'s workspace is gone and the fan-out actually finished (isReady)', () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			workspaces: [], // ws-1 nowhere in the merged list
			sessionsByHost: {},
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({ "card-1": "workspace" });
	});

	it('does NOT mark "workspace" when a host is unreachable with zero contributed rows — no hostReachable:false marker exists to catch it, only isReady can', () => {
		const result = computeMissingCards({
			hostsSettled: true,
			// The fan-out hasn't actually finished: an unreachable host with no
			// cached snapshot contributes neither a row nor a hostReachable
			// marker, so workspaces reads as an innocuous empty list even
			// though nothing has been confirmed gone.
			isReady: false,
			cards: [card()],
			workspaces: [],
			sessionsByHost: {},
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({});
	});

	it('does NOT mark "workspace" when the card\'s workspace is gone but some host is unreachable', () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			// The workspace list still has *a* row, just not ws-1 — and one
			// host is flagged unreachable, so "gone" can't be trusted yet.
			workspaces: [workspace({ id: "ws-other", hostReachable: false })],
			sessionsByHost: {},
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({});
	});

	it('marks "terminal" when the workspace exists but the terminal is absent from its own host\'s answered list', () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card({ terminalId: "term-gone" })],
			workspaces: [workspace()],
			// HOST_A answered — it just doesn't list term-gone.
			sessionsByHost: { [HOST_A]: new Set(["term-other"]) },
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({ "card-1": "terminal" });
	});

	it("does NOT mark a createOnAttach card whose session does not exist yet", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card({ createOnAttach: true, terminalId: "term-not-yet" })],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-other"]) },
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({});
		// Still waiting on its socket to spawn the session — nothing to
		// confirm, so the exemption stands.
		expect(result?.started).toEqual([]);
	});

	it("reports a createOnAttach card as started once its own host lists the session, so the exemption expires", () => {
		// Without this the exemption is permanent: a card added via "New
		// terminal in…" never earns the dead tile, and every reattach still
		// carries `?create=1`.
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card({ createOnAttach: true })],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-1"]) },
			resolveHostUrl,
		});
		expect(result?.started).toEqual(["card-1"]);
		expect(result?.missing).toEqual({});
	});

	it("does NOT confirm a createOnAttach card from a host that is not its own", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card({ createOnAttach: true })],
			workspaces: [workspace()],
			// Some other host happens to have a session with the same id; the
			// card's own host has not answered.
			sessionsByHost: { "http://host-b": new Set(["term-1"]) },
			resolveHostUrl,
		});
		expect(result?.started).toEqual([]);
		expect(result?.missing).toEqual({});
	});

	it("does not re-report a card that no longer carries the flag", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-1"]) },
			resolveHostUrl,
		});
		expect(result?.started).toEqual([]);
	});

	it("leaves a live card alone when its terminal is present in its host's answered list", () => {
		const result = computeMissingCards({
			hostsSettled: true,
			isReady: true,
			cards: [card()],
			workspaces: [workspace()],
			sessionsByHost: { [HOST_A]: new Set(["term-1"]) },
			resolveHostUrl,
		});
		expect(result?.missing).toEqual({});
	});
});
