import { describe, expect, it } from "bun:test";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { collectBackgroundWork } from "./collectBackgroundWork";

function binding(fields: Partial<TerminalAgentBinding>): TerminalAgentBinding {
	return {
		terminalId: "t1",
		workspaceId: "w1",
		agentId: "claude",
		startedAt: 0,
		lastEventAt: 0,
		lastEventType: "Start",
		...fields,
	} as TerminalAgentBinding;
}

describe("collectBackgroundWork", () => {
	it("splits a chat's tasks by kind and lists a terminal's subagent roster", () => {
		const { processes, subagents } = collectBackgroundWork(
			[
				binding({
					terminalId: "chat",
					chatSessionId: "s1",
					backgroundTasks: [
						{
							id: "p",
							kind: "process",
							name: "mint dev",
							canStop: true,
							startedAtMs: 2,
						},
						{
							id: "a",
							kind: "subagent",
							name: "Review",
							canStop: false,
							startedAtMs: 3,
						},
					],
				}),
				binding({
					terminalId: "cli",
					subagents: [
						{ id: "x", agentType: "Explore", startedAt: 1, lastEventAt: 1 },
					],
				}),
			],
			[{ terminalId: "bg", title: "bun dev", createdAt: 1 }],
		);
		expect(processes).toMatchObject([
			{ name: "bun dev", stop: { type: "terminal" }, detachedTerminal: true },
			{
				name: "mint dev",
				stop: { type: "chat", chatSessionId: "s1", taskId: "p" },
			},
		]);
		expect(subagents.map((work) => work.name)).toEqual(["Explore", "Review"]);
		expect(subagents[0]?.subagent).toEqual({
			id: "x",
			agentId: "claude",
			agentType: "Explore",
		});
	});
});
