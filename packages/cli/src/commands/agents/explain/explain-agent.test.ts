import { describe, expect, test } from "bun:test";
import { explainAgent } from "./explain-agent";

const NOW = 1_000_000_000;
const binding = (lastEventType: string, extra = {}) => ({
	agentId: "claude",
	lastEventType,
	lastEventAt: NOW - 12_000,
	startedAt: NOW - 180_000,
	...extra,
});
const explain = (
	input: Partial<Parameters<typeof explainAgent>[0]> & {
		binding: Parameters<typeof explainAgent>[0]["binding"];
	},
) =>
	explainAgent({
		terminalAlive: true,
		processRunning: true,
		now: NOW,
		...input,
	});

describe("explainAgent", () => {
	test("a blocked agent is explained by its permission request", () => {
		const result = explain({ binding: binding("PermissionRequest") });
		expect(result.headline).toBe("claude is blocked.");
		expect(result.because).toContain("waiting on you");
		expect(result.details[0]).toContain("12 seconds ago");
	});

	test("a recorded Stop allows for an interrupt, since Superset records one as Stop", () => {
		expect(explain({ binding: binding("Stop") }).because).toContain(
			"or it was interrupted",
		);
	});

	test("subagents and queued prompts from the live row are listed", () => {
		const result = explain({
			binding: binding("Start", {
				subagents: [{ agentType: "Explore", startedAt: NOW - 40_000 }],
				queuedPrompts: 2,
			}),
		});
		expect(result.details).toContain(
			"Subagent Explore running for 40 seconds.",
		);
		expect(result.details).toContain("2 prompt(s) queued behind this turn.");
	});

	test("an ended agent is exited only when nothing runs, and a new process is not named after it", () => {
		const ended = binding("Stop", {
			endedAt: NOW - 60_000,
			endReason: "detached",
		});
		expect(explain({ binding: ended, processRunning: false }).state).toBe(
			"exited",
		);
		const relaunched = explain({ binding: ended, processRunning: true });
		expect(relaunched).toMatchObject({ state: "starting", agentId: null });
		expect(relaunched.headline).not.toContain("claude");
	});

	test("a running process with no hook does not claim to be an agent", () => {
		const result = explain({ binding: null });
		expect(result.state).toBe("starting");
		expect(result.headline).toBe("No agent hook from this terminal yet.");
	});

	test("a plain shell, an unknown terminal, and an unchecked process each say so", () => {
		expect(explain({ binding: null, processRunning: false }).state).toBe(
			"none",
		);
		expect(
			explain({ binding: null, terminalAlive: false, processRunning: false })
				.headline,
		).toBe("No such terminal running.");
		expect(explain({ binding: null, processRunning: null }).details).toContain(
			"The host could not say whether a process is running in the terminal.",
		);
	});
});
