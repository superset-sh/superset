import { describe, expect, it } from "bun:test";
import type { AccountEngineHostDeps } from "../host-deps.ts";
import type { MovableSession } from "../session-mover.ts";
import type { AccountRpc } from "./rpc.ts";
import {
	executeSessionCommand,
	MachineSessions,
	snapshotSessions,
} from "./sessions.ts";

function fixture() {
	const row: MovableSession = {
		agent: "claude",
		terminalId: "terminal",
		workspaceId: "workspace",
		managed: true,
		configDir: "/profile",
		lastEventType: "Stop",
		lastEventAt: 100,
	};
	let busy = false;
	const actions: string[] = [];
	const host: AccountEngineHostDeps = {
		listSessions: (agent) => (agent === row.agent ? [row] : []),
		isAgentBusy: () => busy,
		isTerminalAlive: () => true,
		lastAgentEvent: () => ({ type: row.lastEventType, at: row.lastEventAt }),
		killAndResume: async () => {
			actions.push("kill");
			return { terminalId: "resumed" };
		},
		sendToTerminal: async () => {
			actions.push("send");
		},
		snapshotTerminal: async () => "screen",
		hasStartedAgent: () => true,
		isBracketedPasteActive: () => true,
	};
	return {
		host,
		row,
		actions,
		setBusy: (value: boolean) => {
			busy = value;
		},
	};
}

describe("machine account session boundary", () => {
	it("allows an authorized busy Codex limit recovery only while its live limit remains", async () => {
		const { host, row, actions, setBusy } = fixture();
		row.agent = "codex";
		row.lastEventType = "Start";
		row.lastEventAt = Date.now();
		setBusy(true);
		const expected = { ...row };
		expect(
			await executeSessionCommand(host, "killAndResume", [expected]),
		).toBeNull();
		host.snapshotTerminal = async () => "You've hit your usage limit";
		expect(
			await executeSessionCommand(host, "killAndResume", [
				expected,
				undefined,
				"limit-stop",
			]),
		).toEqual({ terminalId: "resumed" });
		host.snapshotTerminal = async () => {
			row.lastEventAt += 1;
			return "You've hit your usage limit";
		};
		expect(
			await executeSessionCommand(host, "killAndResume", [
				expected,
				undefined,
				"limit-stop",
			]),
		).toBeNull();
		expect(actions).toEqual(["kill"]);
	});
	it("keeps a failed accepted resume retry without authorizing a new dead session", async () => {
		const { host, row } = fixture();
		const pending = new Map<string, MovableSession>();
		let calls = 0;
		host.killAndResume = async () => {
			calls++;
			host.isTerminalAlive = () => false;
			host.listSessions = () => [];
			return calls === 1 ? null : { terminalId: "resumed" };
		};
		expect(
			await executeSessionCommand(host, "killAndResume", [row], pending),
		).toBeNull();
		expect(
			await executeSessionCommand(host, "killAndResume", [row], pending),
		).toEqual({ terminalId: "resumed" });
		expect(
			await executeSessionCommand(host, "killAndResume", [row], pending),
		).toBeNull();
		expect(calls).toBe(2);
	});
	it("routes identical terminal IDs in two orgs to their owning host", async () => {
		const machine = new MachineSessions();
		const calls: string[] = [];
		const makePeer = (org: string) =>
			({
				socket: { destroy() {} },
				request: async () => {
					calls.push(org);
					return { terminalId: "resumed" };
				},
			}) as unknown as AccountRpc;
		for (const org of ["org-a", "org-b"]) {
			const peer = makePeer(org);
			machine.register(org, peer);
			machine.update(org, peer, snapshotSessions(fixture().host));
		}
		const rows = machine.hostDeps.listSessions("claude");
		expect(rows).toHaveLength(2);
		expect(rows[0]?.terminalId).not.toBe(rows[1]?.terminalId);
		for (const row of rows) await machine.hostDeps.killAndResume(row);
		expect(calls).toEqual(["org-a", "org-b"]);
	});
	it("rejects a stale move after the local session became busy or pinned", async () => {
		const { host, row, actions, setBusy } = fixture();
		const expected = { ...row };
		setBusy(true);
		expect(
			await executeSessionCommand(host, "killAndResume", [expected]),
		).toBeNull();
		setBusy(false);
		row.managed = false;
		expect(
			await executeSessionCommand(host, "killAndResume", [expected]),
		).toBeNull();
		row.managed = true;
		row.configDir = "/different-profile";
		// listSessions resolves today's default pointer; a successful switch
		// changes it before the intended old session is restarted.
		expect(
			await executeSessionCommand(host, "killAndResume", [expected]),
		).toEqual({ terminalId: "resumed" });
		row.lastEventAt += 1;
		expect(
			await executeSessionCommand(host, "killAndResume", [expected]),
		).toBeNull();
		expect(actions).toEqual(["kill"]);
	});
	it("removes a disconnected org without forgetting other orgs", () => {
		const machine = new MachineSessions();
		const peer = () => ({ socket: { destroy() {} } }) as unknown as AccountRpc;
		const a = peer();
		const b = peer();
		machine.register("a", a);
		machine.register("b", b);
		machine.update("a", a, snapshotSessions(fixture().host));
		machine.update("b", b, snapshotSessions(fixture().host));
		machine.unregister("a", a);
		expect(machine.hostDeps.listSessions("claude")).toHaveLength(1);
		const replacement = peer();
		machine.register("b", replacement);
		machine.update("b", replacement, snapshotSessions(fixture().host));
		machine.unregister("b", b);
		expect(machine.hostDeps.listSessions("claude")).toHaveLength(1);
	});
});
