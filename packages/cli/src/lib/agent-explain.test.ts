import { describe, expect, test } from "bun:test";
import { explainAgent } from "./agent-explain";

const NOW = 1_000_000_000;
const binding = (lastEventType: string, extra = {}) => ({
	agentId: "claude",
	lastEventType,
	lastEventAt: NOW - 12_000,
	startedAt: NOW - 180_000,
	...extra,
});

describe("explainAgent", () => {
	test("a plain shell has no agent, rather than one starting", () => {
		expect(
			explainAgent({
				binding: null,
				terminalAlive: true,
				processRunning: false,
				now: NOW,
			}).state,
		).toBe("none");
	});

	test("a blocked agent is explained by its permission request and how long ago it came", () => {
		const result = explainAgent({
			binding: binding("PermissionRequest"),
			terminalAlive: true,
			processRunning: true,
			now: NOW,
		});
		expect(result.state).toBe("blocked");
		expect(result.because).toContain("PermissionRequest (12 seconds ago)");
		expect(result.because).toContain("waiting on you");
	});

	test("an ended agent is exited when nothing runs, starting when something new does", () => {
		const ended = binding("Stop", {
			endedAt: NOW - 60_000,
			endReason: "detached",
		});
		expect(
			explainAgent({
				binding: ended,
				terminalAlive: true,
				processRunning: false,
				now: NOW,
			}).state,
		).toBe("exited");
		expect(
			explainAgent({
				binding: ended,
				terminalAlive: true,
				processRunning: true,
				now: NOW,
			}).state,
		).toBe("starting");
	});

	test("a running process with no hook points at missing hooks", () => {
		const result = explainAgent({
			binding: null,
			terminalAlive: true,
			processRunning: true,
			now: NOW,
		});
		expect(result.state).toBe("starting");
		expect(result.because).toContain("hooks are not installed");
	});
});
