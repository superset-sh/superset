import { describe, expect, it } from "bun:test";
import type { HostAgentSessionMatch } from "../../../lib/host-agent-sessions";
import {
	parseDuration,
	parseStatus,
	selectExactSession,
	waitForSession,
} from "./shared";

describe("session option parsing", () => {
	it("parses duration suffixes", () => {
		expect(parseDuration("250ms")).toBe(250);
		expect(parseDuration("30s")).toBe(30_000);
		expect(parseDuration("5m")).toBe(300_000);
		expect(parseDuration("1h")).toBe(3_600_000);
	});

	it("validates lifecycle states", () => {
		expect(parseStatus("permission")).toBe("permission");
		expect(() => parseStatus("done")).toThrow("Invalid session status");
	});
});

describe("selectExactSession", () => {
	const makeMatch = (hostId: string, terminalId = "session-1") =>
		({ hostId, session: { terminalId } }) as HostAgentSessionMatch;

	it("selects one exact full id across hosts", () => {
		expect(
			selectExactSession(
				[makeMatch("host-a", "other"), makeMatch("host-b")],
				"session-1",
			).hostId,
		).toBe("host-b");
	});

	it("rejects missing and duplicate ids", () => {
		expect(() => selectExactSession([], "missing")).toThrow("not found");
		expect(() =>
			selectExactSession(
				[makeMatch("host-a"), makeMatch("host-b")],
				"session-1",
			),
		).toThrow("multiple hosts");
	});
});

describe("waitForSession", () => {
	it("does not accept a pre-send idle state before the event cursor", async () => {
		const states = [
			{ status: "idle", lastEventAt: 99 },
			{ status: "working", lastEventAt: 101 },
			{ status: "idle", lastEventAt: 102 },
		] as const;
		let call = 0;
		const base = {
			terminalId: "session-1",
			workspaceId: "workspace-1",
			agentId: "claude",
			startedAt: 1,
			lastEventType: "Stop",
		};
		const match = {
			session: { ...base, ...states[0] },
			client: {
				terminalAgents: {
					get: {
						query: async () => ({
							...base,
							...states[Math.min(call++, states.length - 1)],
						}),
					},
				},
			},
		} as unknown as HostAgentSessionMatch;

		const result = await waitForSession({
			match,
			statuses: new Set(["idle"]),
			timeoutMs: 1000,
			minEventAt: 100,
			signal: new AbortController().signal,
			pollIntervalMs: 1,
		});

		expect(result.status).toBe("idle");
		expect("lastEventAt" in result ? result.lastEventAt : 0).toBe(102);
		expect(call).toBe(3);
	});

	it("returns exited when the session disappears", async () => {
		const match = {
			session: {
				terminalId: "session-1",
				status: "working",
			},
			client: {
				terminalAgents: {
					get: {
						query: async () => {
							throw Object.assign(new Error("missing"), {
								data: { code: "NOT_FOUND" },
							});
						},
					},
				},
			},
		} as unknown as HostAgentSessionMatch;
		expect(
			await waitForSession({
				match,
				statuses: new Set(["idle"]),
				timeoutMs: 100,
				signal: new AbortController().signal,
				pollIntervalMs: 1,
			}),
		).toEqual({ status: "exited" });
	});
});
