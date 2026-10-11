import { describe, expect, test } from "bun:test";
import {
	agentReactedSince,
	agentWaitSatisfied,
	agentWaitState,
	pollUntil,
	withAgentExit,
} from "./agent-wait";

describe("agentWaitSatisfied", () => {
	const at = (lastEventType: string, lastEventAt = 1) => ({
		binding: { lastEventType, lastEventAt },
		terminalAlive: true,
	});

	test("settled matches a finished, blocked or exited agent but not a working one", () => {
		expect(agentWaitSatisfied(at("Start"), "settled")).toBe(false);
		expect(agentWaitSatisfied(at("Stop"), "settled")).toBe(true);
		expect(agentWaitSatisfied(at("PermissionRequest"), "settled")).toBe(true);
		expect(agentWaitSatisfied(at("PermissionRequest"), "idle")).toBe(false);
		expect(
			agentWaitSatisfied(
				{ binding: undefined, terminalAlive: false },
				"settled",
			),
		).toBe(true);
	});

	test("an agent that has not sent its first hook is not settled yet", () => {
		expect(
			agentWaitSatisfied(
				{ binding: undefined, terminalAlive: true },
				"settled",
			),
		).toBe(false);
		expect(agentWaitSatisfied(at("Attached"), "settled")).toBe(false);
	});

	test("with a baseline, the previous turn's Stop does not count", () => {
		expect(agentWaitSatisfied(at("Stop", 100), "settled", 100)).toBe(false);
		expect(agentWaitSatisfied(at("Stop", 101), "settled", 100)).toBe(true);
	});
});

describe("agentReactedSince", () => {
	test("counts a newer hook event or an exit, not the state before the send", () => {
		const binding = (lastEventAt: number) => ({
			binding: { lastEventType: "Stop", lastEventAt },
			terminalAlive: true,
		});
		expect(agentReactedSince(binding(100), 100)).toBe(false);
		expect(agentReactedSince(binding(101), 100)).toBe(true);
		expect(
			agentReactedSince({ binding: undefined, terminalAlive: false }, 100),
		).toBe(true);
	});
});

describe("withAgentExit", () => {
	test("an agent that was seen and then lost its binding has exited, though its shell lives on", () => {
		const shellOnly = { binding: undefined, terminalAlive: true };
		expect(agentWaitState(withAgentExit(false, shellOnly))).toBe("starting");
		expect(agentWaitState(withAgentExit(true, shellOnly))).toBe("exited");
	});
});

describe("pollUntil", () => {
	test("returns the first value that satisfies done", async () => {
		const values = ["Start", "Start", "Stop"];
		let clock = 0;
		const result = await pollUntil({
			read: async () => values.shift() ?? "Stop",
			done: (value) => value === "Stop",
			timeoutMs: 10_000,
			intervalMs: 500,
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
		});
		expect(result).toEqual({ value: "Stop", timedOut: false });
		expect(clock).toBe(1_000);
	});

	test("reports a timeout with the last value read", async () => {
		let clock = 0;
		const result = await pollUntil({
			read: async () => "Start",
			done: () => false,
			timeoutMs: 1_200,
			intervalMs: 500,
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
		});
		expect(result).toEqual({ value: "Start", timedOut: true });
		expect(clock).toBe(1_200);
	});
});
