import { describe, expect, it } from "bun:test";
import {
	PORT_SCAN_WARMUP_DELAYS_MS,
	planPortScanSync,
	planStaleActiveRows,
	REAP_INTERVAL_MS,
	shouldReapRow,
} from "./reaper.ts";

const noneLive = () => false;

describe("port-scan warm-up schedule", () => {
	it("re-syncs multiple times after startup so ports recover without a reap tick", () => {
		expect(PORT_SCAN_WARMUP_DELAYS_MS.length).toBeGreaterThanOrEqual(3);
	});

	it("runs strictly increasing offsets", () => {
		for (let i = 1; i < PORT_SCAN_WARMUP_DELAYS_MS.length; i += 1) {
			expect(PORT_SCAN_WARMUP_DELAYS_MS[i]).toBeGreaterThan(
				PORT_SCAN_WARMUP_DELAYS_MS[i - 1] as number,
			);
		}
	});

	it("fully precedes the first scheduled reap so it covers the gap", () => {
		// Every warm-up must fire before the 5-minute reap would otherwise be the
		// first re-sync — that's the window this fix closes.
		for (const delay of PORT_SCAN_WARMUP_DELAYS_MS) {
			expect(delay).toBeLessThan(REAP_INTERVAL_MS);
		}
	});
});

describe("planPortScanSync", () => {
	it("registers alive daemon sessions that map to an active workspace row", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: noneLive,
		});

		expect(plan.register).toEqual([
			{ terminalId: "term-1", workspaceId: "ws-1", pid: 4242 },
		]);
		expect(plan.unregister).toEqual([]);
	});

	it("skips sessions already owned by a live in-memory session", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: (id) => id === "term-1",
		});

		expect(plan.register).toEqual([]);
	});

	it("skips sessions without a row, without a workspace, or not active", () => {
		const plan = planPortScanSync({
			liveSessions: [
				{ id: "rowless", pid: 1 },
				{ id: "no-workspace", pid: 2 },
				{ id: "exited", pid: 3 },
				{ id: "disposed", pid: 4 },
			],
			rowById: new Map([
				["no-workspace", { status: "active", originWorkspaceId: null }],
				["exited", { status: "exited", originWorkspaceId: "ws-1" }],
				["disposed", { status: "disposed", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: noneLive,
		});

		expect(plan.register).toEqual([]);
	});

	it("unregisters scanned terminals the daemon no longer reports", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: ["term-1", "dead-term"],
			isLive: noneLive,
		});

		expect(plan.unregister).toEqual(["dead-term"]);
	});

	it("clears every adopted scan when the daemon reports no live sessions", () => {
		const plan = planPortScanSync({
			liveSessions: [],
			rowById: new Map(),
			registeredTerminalIds: ["term-1", "term-2"],
			isLive: noneLive,
		});

		expect(plan.unregister).toEqual(["term-1", "term-2"]);
	});

	it("keeps scanning a renderer-attached session momentarily absent from daemon.list", () => {
		const plan = planPortScanSync({
			liveSessions: [],
			rowById: new Map(),
			registeredTerminalIds: ["attached-term"],
			isLive: (id) => id === "attached-term",
		});

		expect(plan.unregister).toEqual([]);
	});
});

describe("shouldReapRow", () => {
	it("reaps rows whose dispose was requested but never confirmed", () => {
		expect(
			shouldReapRow({
				status: "active",
				originWorkspaceId: "ws-1",
				disposeRequestedAt: 1_000,
			}),
		).toBe(true);
	});

	it("keeps live sessions with a workspace and no dispose request", () => {
		expect(shouldReapRow({ status: "active", originWorkspaceId: "ws-1" })).toBe(
			false,
		);
		expect(
			shouldReapRow({
				status: "active",
				originWorkspaceId: "ws-1",
				disposeRequestedAt: null,
			}),
		).toBe(false);
	});

	it("still reaps dead-status and workspace-less rows", () => {
		expect(
			shouldReapRow({ status: "disposed", originWorkspaceId: "ws-1" }),
		).toBe(true);
		expect(shouldReapRow({ status: "exited", originWorkspaceId: "ws-1" })).toBe(
			true,
		);
		expect(shouldReapRow({ status: "active", originWorkspaceId: null })).toBe(
			true,
		);
	});
});

describe("planStaleActiveRows", () => {
	const NOW = 1_000_000;
	const OLD = NOW - 120_000;

	function rows(entries: [string, TerminalRowLike][]) {
		return new Map(entries);
	}
	interface TerminalRowLike {
		status: string;
		originWorkspaceId: string | null;
		createdAt?: number;
		disposeRequestedAt?: number | null;
	}

	it("marks active rows the daemon no longer owns", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(["t-alive"]),
			rowsById: rows([
				[
					"t-alive",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
				[
					"t-dead",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-dead"], disposed: [] });
	});

	it("skips rows that are not active", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				["t-1", { status: "exited", originWorkspaceId: "ws", createdAt: OLD }],
				[
					"t-2",
					{ status: "disposed", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: [], disposed: [] });
	});

	it("respects the in-memory live guard against a racy daemon list", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-attached",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: (id) => id === "t-attached",
			now: NOW,
		});
		expect(stale).toEqual({ exited: [], disposed: [] });
	});

	it("leaves freshly created rows alone during the spawn grace window", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-new",
					{ status: "active", originWorkspaceId: "ws", createdAt: NOW - 5_000 },
				],
				[
					"t-old",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-old"], disposed: [] });
	});

	it("marks everything stale when the daemon answers with zero sessions", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				["t-1", { status: "active", originWorkspaceId: "ws", createdAt: OLD }],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-1"], disposed: [] });
	});

	it("preserves dispose intent: daemon-lost rows with a pending dispose become disposed", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-disposing",
					{
						status: "active",
						originWorkspaceId: "ws",
						createdAt: OLD,
						disposeRequestedAt: NOW - 30_000,
					},
				],
				[
					"t-crashed",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-crashed"], disposed: ["t-disposing"] });
	});
});
