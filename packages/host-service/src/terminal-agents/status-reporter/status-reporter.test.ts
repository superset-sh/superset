import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import type { AgentStatusReport } from "@superset/shared/agent-status";
import type { TerminalAgentBinding } from "../types";
import { TerminalAgentStatusReporter } from "./status-reporter";

class FakeStore extends EventEmitter {
	bindings = new Map<string, TerminalAgentBinding>();

	list(): TerminalAgentBinding[] {
		return [...this.bindings.values()].filter((b) => b.endedAt === undefined);
	}

	event(terminalId: string, lastEventType: string, at = Date.now()): void {
		const prior = this.bindings.get(terminalId);
		this.bindings.set(terminalId, {
			terminalId,
			workspaceId: "ws-1",
			agentId: "claude",
			startedAt: prior?.startedAt ?? at,
			lastEventAt: at,
			// Like the real store: a launch report never rewinds lifecycle state.
			lastEventType:
				lastEventType === "Attached" && prior
					? prior.lastEventType
					: lastEventType,
		});
		this.emit("change", "ws-1");
	}

	end(terminalId: string): void {
		const prior = this.bindings.get(terminalId);
		if (!prior) return;
		this.bindings.set(terminalId, { ...prior, endedAt: Date.now() });
		this.emit("change", "ws-1");
	}
}

function setup(options: { fail?: () => boolean } = {}) {
	const store = new FakeStore();
	const reports: AgentStatusReport[] = [];
	const reporter = new TerminalAgentStatusReporter({
		store,
		machineId: "mac-1",
		debounceMs: 5,
		send: async (report) => {
			if (options.fail?.()) throw new Error("offline");
			reports.push(report);
		},
		describeWorkspace: (id) =>
			id === "ws-1"
				? { name: "Fix login", projectId: "p1", projectName: "superset" }
				: null,
	});
	return { store, reports, reporter };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("TerminalAgentStatusReporter", () => {
	it("collapses a burst of tool calls into one working transition", async () => {
		const { store, reports } = setup();
		for (let i = 0; i < 10; i++) store.event("t1", "Start", 1_000 + i);
		await settle();
		expect(reports).toHaveLength(1);
		expect(reports[0]).toEqual({
			machineId: "mac-1",
			terminals: [
				{
					terminalId: "t1",
					workspaceId: "ws-1",
					workspaceName: "Fix login",
					projectId: "p1",
					projectName: "superset",
					state: "working",
					sinceAt: 1_009,
				},
			],
		});
	});

	it("reports only the final state of a debounce window", async () => {
		const { store, reports } = setup();
		store.event("t1", "Start");
		store.event("t1", "Stop");
		await settle();
		expect(reports.map((r) => r.terminals[0]?.state)).toEqual(["review"]);
	});

	it("sends nothing when the state did not change", async () => {
		const { store, reports } = setup();
		store.event("t1", "Start");
		await settle();
		store.event("t1", "Start");
		store.event("t1", "Attached");
		await settle();
		expect(reports).toHaveLength(1);
	});

	it("retries a failed report on the next change", async () => {
		let offline = true;
		const { store, reports } = setup({ fail: () => offline });
		store.event("t1", "Start");
		await settle();
		expect(reports).toHaveLength(0);
		offline = false;
		store.event("t2", "PermissionRequest");
		await settle();
		expect(reports).toHaveLength(1);
		expect(reports[0]?.terminals.map((t) => [t.terminalId, t.state])).toEqual([
			["t1", "working"],
			["t2", "permission"],
		]);
	});

	it("reports an ended terminal gone exactly once", async () => {
		const { store, reports } = setup();
		store.event("t1", "Start");
		await settle();
		store.end("t1");
		await settle();
		store.emit("change", "ws-1");
		await settle();
		expect(reports).toHaveLength(2);
		expect(reports[1]?.terminals).toEqual([
			expect.objectContaining({ terminalId: "t1", state: "gone" }),
		]);
	});

	it("skips terminals whose workspace is unknown", async () => {
		const { store, reports } = setup();
		store.bindings.set("t9", {
			terminalId: "t9",
			workspaceId: "ws-unknown",
			agentId: "claude",
			startedAt: 1,
			lastEventAt: 1,
			lastEventType: "Start",
		});
		store.emit("change", "ws-unknown");
		await settle();
		expect(reports).toHaveLength(0);
	});

	it("reports everything gone on shutdown", async () => {
		const { store, reports, reporter } = setup();
		store.event("t1", "Start");
		store.event("t2", "Stop");
		await settle();
		await reporter.reportAllGone();
		expect(reports).toHaveLength(2);
		expect(reports[1]?.terminals.map((t) => t.state)).toEqual(["gone", "gone"]);
		store.event("t3", "Start");
		await settle();
		expect(reports).toHaveLength(2);
	});
});
