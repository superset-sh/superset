/**
 * PRIMARY ACP acceptance lane: drives the real `claude-agent-acp` adapter and
 * real Claude models through AcpSessionManager in a temp worktree.
 *
 * Run this on an authenticated Mac whenever changing the ACP runtime, adapter
 * bridge, workflows, permissions, questions, cancellation, or resurrection.
 * It is gated only because CI does not have a Claude login and it spends real
 * tokens; deterministic adapter tests are regression backup, not a substitute.
 *
 *   ACP_E2E=1 ACP_E2E_MODEL=sonnet ACP_E2E_EFFORT=low \
 *     bun test test/integration/acp-sessions.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";

const RUN = process.env.ACP_E2E === "1";
const E2E_MODEL = process.env.ACP_E2E_MODEL ?? "sonnet";
const E2E_EFFORT = process.env.ACP_E2E_EFFORT ?? "low";

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

	beforeAll(async () => {
		workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-m2-"));
		writeFileSync(
			path.join(workspaceDir, "notes.txt"),
			"fixture_id=sonnet-workflow\nvalues=13,29\nexpected_sum=42\n",
		);
		const workflowsDir = path.join(workspaceDir, ".claude", "workflows");
		mkdirSync(workflowsDir, { recursive: true });
		writeFileSync(
			path.join(workflowsDir, "acp-e2e-dummy.js"),
			`export const meta = {
  name: "acp-e2e-dummy",
  description: "Run a multi-agent inspect, analyze, audit, and verify workflow",
  phases: [
    { title: "Inspect", detail: "Parse the fixture through a subagent" },
    { title: "Analyze", detail: "Derive an independent proof" },
    { title: "Audit", detail: "Cross-check the source and proof in parallel" },
    { title: "Verify", detail: "Converge on a structured verdict" },
  ],
}

phase("Inspect")
const inspected = await agent(
  "Read notes.txt. Return its fixture_id, the two integer values, and their computed sum. Do not modify files and do not use Bash.",
  {
    label: "inspect-fixture",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fixtureId", "values", "sum"],
      properties: {
        fixtureId: { type: "string" },
        values: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
        sum: { type: "integer" },
      },
    },
  },
)

phase("Analyze")
const analyzed = await agent(
  "Using this inspected data: " + JSON.stringify(inspected) +
    ", independently read notes.txt, verify it matches, and derive the sum, product, and the exact equation 13 + 29 = 42. Do not modify files and do not use Bash.",
  {
    label: "derive-proof",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fixtureId", "sum", "product", "equation"],
      properties: {
        fixtureId: { type: "string" },
        sum: { type: "integer" },
        product: { type: "integer" },
        equation: { type: "string" },
      },
    },
  },
)

phase("Audit")
const audits = await pipeline(["source", "arithmetic"], angle =>
  agent(
    "Independently audit the " + angle +
      " side of this fixture. Read notes.txt and cross-check inspected=" +
      JSON.stringify(inspected) + ", analyzed=" + JSON.stringify(analyzed) +
      ". Verify fixtureId sonnet-workflow, values 13 and 29, sum 42, product 377, and equation 13 + 29 = 42. Report concrete evidence. Do not modify files and do not use Bash.",
    {
      label: "audit-" + angle,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["angle", "passed", "evidence"],
        properties: {
          angle: { type: "string" },
          passed: { type: "boolean" },
          evidence: { type: "string" },
        },
      },
    },
  ),
)

phase("Verify")
const verified = await agent(
  "Act as the final verifier. Read notes.txt. Cross-check these prior results: inspected=" +
    JSON.stringify(inspected) + ", analyzed=" + JSON.stringify(analyzed) +
    ", audits=" + JSON.stringify(audits) +
    ". Return valid only when both audits passed, fixtureId is sonnet-workflow, values are 13 and 29, sum is 42, product is 377, and the equation is exact. When valid, set marker exactly WORKFLOW_VERIFIED. Do not modify files and do not use Bash.",
  {
    label: "verify-proof",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["valid", "fixtureId", "sum", "auditCount", "marker"],
      properties: {
        valid: { type: "boolean" },
        fixtureId: { type: "string" },
        sum: { type: "integer" },
        auditCount: { type: "integer" },
        marker: { type: "string" },
      },
    },
  },
)

return { inspected, analyzed, audits, verified }
`,
		);
		execSync(
			"git init -q && git add -A && git -c user.email=m2@superset.sh -c user.name=m2 commit -qm init",
			{ cwd: workspaceDir },
		);
		manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
		});
		const created = await manager.create({ sessionId, workspaceId });
		const model = created.configOptions.find(
			(option) => option.id === "model" && option.type === "select",
		);
		if (!model || !model.options.some((option) => option.value === E2E_MODEL)) {
			throw new Error(
				`ACP_E2E_MODEL=${E2E_MODEL} is unavailable; adapter offered ${model?.options.map((option) => option.value).join(", ") ?? "no model catalog"}`,
			);
		}
		await manager.setConfigOption({
			sessionId,
			configId: "model",
			value: E2E_MODEL,
		});
		const effort = manager
			.get(sessionId)
			.configOptions.find(
				(option) => option.id === "effort" && option.type === "select",
			);
		if (effort?.options.some((option) => option.value === E2E_EFFORT)) {
			await manager.setConfigOption({
				sessionId,
				configId: "effort",
				value: E2E_EFFORT,
			});
		}
	});

	afterAll(async () => {
		await manager.dispose();
		if (workspaceDir) {
			try {
				rmSync(workspaceDir, { recursive: true, force: true });
			} catch {
				// best-effort
			}
		}
	});

	test("create starts in default mode; prompt folds into getMessages; stream is gapless", async () => {
		const created = manager.get(sessionId);
		expect(created.status).toBe("idle");
		expect(created.harness).toBe("claude-agent-acp");
		expect(created.cwd).toBe(workspaceDir);
		expect(
			created.configOptions.find((option) => option.id === "model")
				?.currentValue,
		).toBe(E2E_MODEL);
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

	test("a saved multi-agent Workflow executes all agents and produces a verified result", async () => {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Launch the named workflow acp-e2e-dummy exactly once with the Workflow tool. Do not perform its work yourself and do not use another tool. The Workflow tool runs asynchronously; after it confirms the background launch, reply with exactly WORKFLOW_LAUNCHED and do not cancel it.",
				},
			],
		});
		// Workflow is a write-capable tool in default permission mode. Approve its
		// real adapter request so the test observes the tool result instead of
		// leaving the turn parked forever.
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the Workflow permission",
		);
		const workflowPermission = manager.get(sessionId).pendingPermissions[0];
		if (!workflowPermission) throw new Error("Workflow permission disappeared");
		const allow =
			workflowPermission.options.find(
				(option) => option.kind === "allow_once",
			) ?? workflowPermission.options[0];
		if (!allow) throw new Error("Workflow permission offered no allow option");
		manager.respondToPermission({
			sessionId,
			requestId: workflowPermission.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		expect((await turn).stopReason).toBe("end_turn");

		const page = manager.getMessages({ sessionId, limit: 300 });
		const workflowCall = page.items.find((envelope) => {
			if (
				envelope.frame.kind !== "update" ||
				envelope.frame.update.sessionUpdate !== "tool_call"
			) {
				return false;
			}
			const meta = envelope.frame.update._meta as
				| { claudeCode?: { toolName?: string } }
				| undefined;
			return meta?.claudeCode?.toolName === "Workflow";
		});
		if (
			!workflowCall ||
			workflowCall.frame.kind !== "update" ||
			workflowCall.frame.update.sessionUpdate !== "tool_call"
		) {
			throw new Error("Workflow tool_call did not cross ACP");
		}
		expect(workflowCall.frame.update.kind).toBe("other");
		expect(workflowCall.frame.update.title).toBe("Workflow");
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const agentText = timeline.items
			.filter((item) => item.kind === "message" && item.role === "agent")
			.flatMap((item) => (item.kind === "message" ? item.blocks : []))
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
		expect(agentText).toContain("WORKFLOW_LAUNCHED");

		type WorkflowLaunch = {
			status?: string;
			runId?: string;
			transcriptDir?: string;
			workflowName?: string;
		};
		const launch = page.items
			.flatMap((envelope): WorkflowLaunch[] => {
				if (
					envelope.frame.kind !== "update" ||
					envelope.frame.update.sessionUpdate !== "tool_call_update"
				) {
					return [];
				}
				const meta = envelope.frame.update._meta as
					| { claudeCode?: { toolResponse?: WorkflowLaunch } }
					| undefined;
				const response = meta?.claudeCode?.toolResponse;
				return response?.status === "async_launched" ? [response] : [];
			})
			.at(-1);
		if (!launch?.runId || !launch.transcriptDir) {
			throw new Error("Workflow launch metadata did not cross ACP");
		}
		expect(launch.workflowName).toBe("acp-e2e-dummy");

		type WorkflowRunState = {
			status?: string;
			error?: string;
			defaultModel?: string;
			agentCount?: number;
			totalTokens?: number;
			totalToolCalls?: number;
			result?: unknown;
		};
		const runStatePath = path.resolve(
			launch.transcriptDir,
			"..",
			"..",
			"..",
			"workflows",
			`${launch.runId}.json`,
		);
		let runState: WorkflowRunState | null = null;
		await waitFor(
			() => {
				if (!existsSync(runStatePath)) return false;
				try {
					runState = JSON.parse(
						readFileSync(runStatePath, "utf8"),
					) as WorkflowRunState;
				} catch {
					return false;
				}
				if (["failed", "killed", "cancelled"].includes(runState.status ?? "")) {
					throw new Error(
						`Workflow run did not complete: ${readFileSync(runStatePath, "utf8")}`,
					);
				}
				return runState.status === "completed";
			},
			240_000,
			"all Sonnet Workflow agents to complete",
		);
		if (!runState) throw new Error("Workflow completed without run state");
		expect(runState.status).toBe("completed");
		expect(runState.defaultModel?.toLowerCase()).toContain(
			E2E_MODEL.toLowerCase(),
		);
		expect(runState.agentCount).toBe(5);
		expect(runState.totalTokens).toBeGreaterThan(0);
		expect(runState.totalToolCalls).toBeGreaterThan(0);
		const workflowResult = runState.result as {
			inspected?: unknown;
			analyzed?: unknown;
			audits?: Array<{ passed?: boolean }>;
			verified?: unknown;
		};
		expect(workflowResult.inspected).toEqual({
			fixtureId: "sonnet-workflow",
			values: [13, 29],
			sum: 42,
		});
		expect(workflowResult.analyzed).toEqual({
			fixtureId: "sonnet-workflow",
			sum: 42,
			product: 377,
			equation: "13 + 29 = 42",
		});
		expect(workflowResult.audits).toHaveLength(2);
		expect(workflowResult.audits?.every((audit) => audit.passed === true)).toBe(
			true,
		);
		expect(workflowResult.verified).toEqual({
			valid: true,
			fixtureId: "sonnet-workflow",
			sum: 42,
			auditCount: 2,
			marker: "WORKFLOW_VERIFIED",
		});
		console.info("[acp-e2e] real Workflow completed", {
			model: runState.defaultModel,
			agentCount: runState.agentCount,
			totalTokens: runState.totalTokens,
			totalToolCalls: runState.totalToolCalls,
		});
	}, 600_000);

	test("AskUserQuestion parks a real adapter elicitation and resumes after the answer", async () => {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Use AskUserQuestion exactly once. Ask 'Pick a fixture color' with exactly two options: red and blue. Do not answer it yourself. After the user answers, reply with exactly QUESTION_OK.",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the real AskUserQuestion card",
		);
		const pending = manager.get(sessionId).pendingPermissions[0];
		if (!pending) throw new Error("AskUserQuestion card disappeared");
		expect(pending.toolCall.title).toContain("Pick a fixture color");
		const blue = pending.options.find((option) => option.name === "blue");
		if (!blue) {
			throw new Error(
				`blue option missing: ${pending.options.map((option) => option.name).join(", ")}`,
			);
		}
		expect(
			manager.respondToPermission({
				sessionId,
				requestId: pending.requestId,
				outcome: { outcome: "selected", optionId: blue.optionId },
			}),
		).toEqual({ status: "resolved" });
		expect((await turn).stopReason).toBe("end_turn");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
	}, 300_000);

	test("parallel real tool calls serialize adapter permissions one at a time", async () => {
		let maxPendingPermissions = 0;
		const unsubscribe = manager.subscribe({
			sessionId,
			onEnvelope: (envelope) => {
				if (envelope.frame.kind === "state") {
					maxPendingPermissions = Math.max(
						maxPendingPermissions,
						envelope.frame.state.pendingPermissions.length,
					);
				}
			},
		});
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Call the Bash tool exactly twice in parallel in the same assistant response. The first command is `printf first > first.txt`; the second command is `printf second > second.txt`. Do not serialize them and do not use any other tool.",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length === 1,
			120_000,
			"the first parallel-tool permission",
		);
		expect(manager.get(sessionId).status).toBe("awaiting_permission");
		const first = manager.get(sessionId).pendingPermissions[0];
		if (!first) throw new Error("first parallel-tool permission disappeared");
		const allow =
			first.options.find((option) => option.kind === "allow_once") ??
			first.options[0];
		if (!allow) throw new Error("first permission offered no allow option");
		manager.respondToPermission({
			sessionId,
			requestId: first.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		await waitFor(
			() => {
				const pending = manager.get(sessionId).pendingPermissions;
				return (
					pending.length === 1 && pending[0]?.requestId !== first.requestId
				);
			},
			30_000,
			"the second serialized permission",
		);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
		unsubscribe();
		// The model emitted two Bash tool_use blocks in one assistant response,
		// but claude-agent-acp 0.56.0 did not expose both permission callbacks at
		// once. Superset's manager supports true concurrency (covered by the fake
		// adapter suite); this assertion pins the real adapter's current behavior.
		expect(maxPendingPermissions).toBe(1);
	}, 300_000);

	test("cancel aborts a real adapter turn after its tool permission is granted", async () => {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Use Bash to run exactly `printf started > abort.txt; sleep 30`. Do not use any other tool and do not replace the command.",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the write-and-sleep permission",
		);
		const pending = manager.get(sessionId).pendingPermissions[0];
		if (!pending) throw new Error("write-and-sleep permission disappeared");
		const allow =
			pending.options.find((option) => option.kind === "allow_once") ??
			pending.options[0];
		if (!allow) {
			throw new Error("write-and-sleep permission offered no allow option");
		}
		manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		await waitFor(
			() => manager.get(sessionId).status === "running",
			30_000,
			"the allowed write-and-sleep tool to run",
		);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.lastStopReason).toBe("cancelled");
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
