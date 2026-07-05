import { describe, expect, it } from "bun:test";
import {
	PORT_SCAN_WARMUP_DELAYS_MS,
	planPortScanSync,
	REAP_INTERVAL_MS,
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
