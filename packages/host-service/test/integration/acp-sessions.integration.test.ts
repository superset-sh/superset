/**
 * M2 acceptance for plans/session-harness-acp.md: drives the real
 * `claude-agent-acp` adapter through AcpSessionManager in a temp worktree.
 *
 * Needs the host machine's logged-in Claude account and spends real tokens,
 * so it only runs when explicitly requested:
 *
 *   ACP_E2E=1 bun test test/integration/acp-sessions.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";

const RUN = process.env.ACP_E2E === "1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await sleep(250);
	}
}

describe.skipIf(!RUN)("acp-sessions manager (real adapter)", () => {
	let manager: AcpSessionManager;
	let workspaceDir: string;
	const sessionId = "acp-m2-session";
	const workspaceId = "acp-m2-workspace";
	const envelopes: SessionUpdateEnvelope[] = [];

	beforeAll(() => {
		workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-m2-"));
		writeFileSync(
			path.join(workspaceDir, "notes.txt"),
			"m2 fixture file — safe to read\n",
		);
		execSync(
			"git init -q && git add -A && git -c user.email=m2@superset.sh -c user.name=m2 commit -qm init",
			{ cwd: workspaceDir },
		);
		manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
		});
	});

	afterAll(async () => {
		await manager.dispose();
	});

	test("create starts in default mode; prompt folds into getMessages; stream is gapless", async () => {
		const created = await manager.create({ sessionId, workspaceId });
		expect(created.status).toBe("idle");
		expect(created.harness).toBe("claude-agent-acp");
		expect(created.cwd).toBe(workspaceDir);
		// D14-c: bypassPermissions default must have been overridden.
		expect(created.currentMode?.currentModeId).toBe("default");

		const unsubscribe = manager.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => envelopes.push(envelope),
		});

		const { accepted, turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Reply with exactly the text M2_OK and nothing else.",
				},
			],
		});
		expect(accepted).toBe(true);
		const { stopReason } = await turn;
		expect(stopReason).toBe("end_turn");

		// The folded timeline from getMessages shows the agent's reply.
		const page = manager.getMessages({ sessionId, limit: 200 });
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const agentText = timeline.items
			.filter((item) => item.kind === "message" && item.role === "agent")
			.flatMap((item) => (item.kind === "message" ? item.blocks : []))
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
		expect(agentText).toContain("M2_OK");

		// Envelope stream is gapless and monotonic from seq 1.
		expect(envelopes.length).toBeGreaterThan(0);
		expect(envelopes[0]?.seq).toBe(1);
		for (let i = 1; i < envelopes.length; i += 1) {
			expect(envelopes[i]?.seq).toBe((envelopes[i - 1]?.seq ?? 0) + 1);
		}
		// The turn landed idle with its stop reason in the final state.
		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.lastStopReason).toBe("end_turn");
		unsubscribe();
	}, 300_000);

	test("permission blocks the turn; first respond wins, second is already_resolved", async () => {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Create a file named hello.txt in the current directory containing exactly: hello from m2",
				},
			],
		});

		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"a pending permission",
		);
		const state = manager.get(sessionId);
		expect(state.status).toBe("awaiting_permission");
		const pending = state.pendingPermissions[0];
		if (!pending) throw new Error("pending permission disappeared");
		const allow =
			pending.options.find((option) => option.kind === "allow_once") ??
			pending.options[0];
		if (!allow) throw new Error("no permission option offered");

		const first = manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		const second = manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		expect(first.status).toBe("resolved");
		expect(second.status).toBe("already_resolved");

		const { stopReason } = await turn;
		expect(stopReason).toBe("end_turn");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
	}, 300_000);

	test("a killed adapter reports dead but stays listed", async () => {
		expect(manager.list({}).items.map((state) => state.sessionId)).toContain(
			sessionId,
		);

		const doomedId = "acp-m2-doomed";
		await manager.create({ sessionId: doomedId, workspaceId });
		expect(manager.list({}).items.map((state) => state.sessionId)).toContain(
			doomedId,
		);

		const pid = manager.adapterPid(doomedId);
		if (!pid) throw new Error("no adapter pid for doomed session");
		process.kill(pid, "SIGKILL");
		await waitFor(
			() => manager.get(doomedId).status === "dead",
			30_000,
			"the doomed session to report dead",
		);

		// Dead sessions stay discoverable (read-only transcript) until the
		// graveyard evicts them.
		expect(manager.list({}).items.map((state) => state.sessionId)).toContain(
			doomedId,
		);
		const dead = manager.get(doomedId);
		expect(dead.status).toBe("dead");
		expect(dead.lastError).toContain("adapter");
		expect(() =>
			manager.prompt({
				sessionId: doomedId,
				prompt: [{ type: "text", text: "hello?" }],
			}),
		).toThrow(/dead/);

		// The original session is untouched by its sibling's death.
		expect(manager.get(sessionId).status).toBe("idle");
	}, 300_000);
});
