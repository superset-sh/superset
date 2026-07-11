/**
 * Real-provider acceptance for the direct Claude Agent SDK session manager.
 *
 * This uses the user's logged-in system Claude installation and spends real
 * tokens, so it is intentionally gated:
 *
 *   CLAUDE_SDK_E2E=1 bun test test/integration/claude-sdk-sessions.integration.test.ts
 *
 * Every tool-capable prompt is constrained to a throwaway Git repository and
 * the test only approves the exact expected tool/input pair.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	deleteSession,
	type SDKMessage,
	type SDKResultMessage,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	emptyTimeline,
	foldEnvelopes,
	type PendingPermissionRequest,
	type SessionEventEnvelope,
} from "@superset/session-protocol";
import { ClaudeSessionManager } from "../../src/runtime/sessions";
import {
	resetClaudeCodeExecutableCacheForTests,
	resolveClaudeCodeExecutable,
} from "../../src/runtime/sessions/claude-runtime";
import {
	getTrustedUserShellBaseEnv,
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
	resolveTerminalBaseEnvWithProvenance,
} from "../../src/terminal/env";

const RUN = process.env.CLAUDE_SDK_E2E === "1";
const TURN_TIMEOUT_MS = 240_000;
const BASH_COMMAND =
	"printf 'manager-e2e-ok\\n' > manager-e2e.txt && cat manager-e2e.txt";

function userMessage(content: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content },
		parent_tool_use_id: null,
	};
}

function isResultMessage(message: SDKMessage): message is SDKResultMessage {
	return message.type === "result";
}

function resultsAfter(
	envelopes: SessionEventEnvelope[],
	after: number,
): SDKResultMessage[] {
	return envelopes
		.slice(after)
		.flatMap(({ frame }) =>
			frame.kind === "sdk" && isResultMessage(frame.message)
				? [frame.message]
				: [],
		);
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

async function waitForResult(
	envelopes: SessionEventEnvelope[],
	after: number,
	label: string,
): Promise<SDKResultMessage> {
	await waitFor(
		() => resultsAfter(envelopes, after).length > 0,
		TURN_TIMEOUT_MS,
		`${label} result`,
	);
	const result = resultsAfter(envelopes, after).at(-1);
	if (!result) throw new Error(`${label} result disappeared`);
	return result;
}

function resultText(result: SDKResultMessage): string {
	return result.subtype === "success"
		? result.result
		: result.errors.join("\n");
}

describe.skipIf(!RUN)("ClaudeSessionManager (real system Claude)", () => {
	let manager: ClaudeSessionManager;
	let workspaceDir: string;
	const createdClaudeSessionIds = new Set<string>();

	beforeAll(async () => {
		workspaceDir = mkdtempSync(
			path.join(tmpdir(), "superset-claude-manager-e2e-"),
		);
		writeFileSync(
			path.join(workspaceDir, "README.md"),
			"# Direct Claude SDK manager E2E\n\nDisposable fixture.\n",
			"utf8",
		);
		execFileSync("git", ["init", "--initial-branch=main"], {
			cwd: workspaceDir,
			stdio: "ignore",
		});
		execFileSync("git", ["config", "user.email", "sdk-e2e@example.invalid"], {
			cwd: workspaceDir,
		});
		execFileSync("git", ["config", "user.name", "SDK Manager E2E"], {
			cwd: workspaceDir,
		});
		execFileSync("git", ["add", "README.md"], { cwd: workspaceDir });
		execFileSync("git", ["commit", "-m", "chore: initialize fixture"], {
			cwd: workspaceDir,
			stdio: "ignore",
		});

		const terminalEnvironment = await resolveTerminalBaseEnvWithProvenance();
		if (terminalEnvironment.provenance !== "user-shell") {
			throw new Error(
				"real Claude E2E requires a trusted login-shell environment snapshot",
			);
		}
		initTerminalBaseEnv(terminalEnvironment.baseEnv, {
			provenance: terminalEnvironment.provenance,
		});

		const executable = resolveClaudeCodeExecutable(
			getTrustedUserShellBaseEnv(),
		);
		const version = execFileSync(executable, ["--version"], {
			encoding: "utf8",
		}).trim();
		expect(path.isAbsolute(executable)).toBe(true);
		expect(executable).not.toContain(`${path.sep}.superset${path.sep}bin`);
		expect(version).toMatch(/\d+\.\d+\.\d+/);

		manager = new ClaudeSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
		});
	});

	afterAll(async () => {
		await manager?.dispose();
		await Promise.allSettled(
			[...createdClaudeSessionIds].map((sessionId) =>
				deleteSession(sessionId, { dir: workspaceDir }),
			),
		);
		rmSync(workspaceDir, { recursive: true, force: true });
		resetClaudeCodeExecutableCacheForTests();
		resetTerminalBaseEnvForTests();
	});

	test("runs multi-turn text, tool approval, structured question, plan approval, controls, interruption, history, and a gapless journal", async () => {
		const sessionId = crypto.randomUUID();
		const workspaceId = crypto.randomUUID();
		const created = await manager.create({
			sessionId,
			workspaceId,
			model: "haiku",
			effort: "low",
			permissionMode: "default",
			title: "Superset direct SDK manager E2E",
		});
		expect(created).toMatchObject({
			harness: "claude",
			status: "idle",
			cwd: workspaceDir,
		});
		const claudeSessionId = created.claudeSessionId;
		if (!claudeSessionId) throw new Error("missing Claude-native session id");
		expect(claudeSessionId).not.toBe(sessionId);
		createdClaudeSessionIds.add(claudeSessionId);

		const envelopes: SessionEventEnvelope[] = [];
		const unsubscribe = manager.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => envelopes.push(envelope),
		});

		const runTurn = async (prompt: string, label: string) => {
			const mark = envelopes.length;
			expect(
				manager.sendMessage({ sessionId, message: userMessage(prompt) }),
			).toEqual({ accepted: true });
			const result = await waitForResult(envelopes, mark, label);
			await waitFor(
				() => manager.get({ sessionId }).status === "idle",
				30_000,
				`${label} idle state`,
			);
			expect(result.is_error).toBe(false);
			return result;
		};

		const baseline = await runTurn(
			"Do not use tools. Reply with exactly DIRECT_SDK_MANAGER_OK and nothing else.",
			"baseline",
		);
		expect(resultText(baseline)).toContain("DIRECT_SDK_MANAGER_OK");

		const permissionMark = envelopes.length;
		expect(
			manager.sendMessage({
				sessionId,
				message: userMessage(
					`Use the Bash tool exactly once with this exact command: ${BASH_COMMAND}. Do not use any other tool or command. Then reply exactly BASH_MANAGER_OK.`,
				),
			}),
		).toEqual({ accepted: true });
		await waitFor(
			() =>
				manager
					.get({ sessionId })
					.pendingPermissions.some((request) => request.toolName === "Bash"),
			TURN_TIMEOUT_MS,
			"Bash permission",
		);
		const bashPermission = manager
			.get({ sessionId })
			.pendingPermissions.find((request) => request.toolName === "Bash");
		if (!bashPermission) throw new Error("Bash permission disappeared");
		expect(bashPermission.input.command).toBe(BASH_COMMAND);
		const allowBash = {
			behavior: "allow" as const,
			updatedInput: bashPermission.input,
		};
		expect(
			manager.respondToPermission({
				sessionId,
				requestId: bashPermission.requestId,
				response: allowBash,
			}),
		).toEqual({ status: "resolved" });
		expect(
			manager.respondToPermission({
				sessionId,
				requestId: bashPermission.requestId,
				response: allowBash,
			}),
		).toEqual({ status: "already_resolved" });
		const bashResult = await waitForResult(
			envelopes,
			permissionMark,
			"Bash turn",
		);
		await waitFor(
			() => manager.get({ sessionId }).status === "idle",
			30_000,
			"Bash idle state",
		);
		expect(resultText(bashResult)).toContain("BASH_MANAGER_OK");
		expect(
			readFileSync(path.join(workspaceDir, "manager-e2e.txt"), "utf8"),
		).toBe("manager-e2e-ok\n");

		const questionMark = envelopes.length;
		manager.sendMessage({
			sessionId,
			message: userMessage(
				"Call AskUserQuestion exactly once. Ask `Which fruit should the manager test select?` with header `Fruit`, single-select options Mango and Papaya, each with a short description. Do not answer it yourself. After receiving the answer, reply exactly FRUIT CHOSEN: <answer>.",
			),
		});
		const questionPermission = await waitForPermission(
			manager,
			sessionId,
			"AskUserQuestion",
		);
		const questions = questionPermission.input.questions;
		const question =
			Array.isArray(questions) &&
			typeof questions[0] === "object" &&
			questions[0] !== null &&
			"question" in questions[0] &&
			typeof questions[0].question === "string"
				? questions[0].question
				: null;
		if (!question) throw new Error("AskUserQuestion input had no question");
		manager.respondToPermission({
			sessionId,
			requestId: questionPermission.requestId,
			response: {
				behavior: "allow",
				updatedInput: {
					...questionPermission.input,
					answers: { [question]: "Papaya" },
				},
			},
		});
		const questionResult = await waitForResult(
			envelopes,
			questionMark,
			"AskUserQuestion turn",
		);
		await waitFor(
			() => manager.get({ sessionId }).status === "idle",
			30_000,
			"AskUserQuestion idle state",
		);
		expect(resultText(questionResult)).toContain("FRUIT CHOSEN: Papaya");

		await manager.setPermissionMode({ sessionId, permissionMode: "plan" });
		expect(manager.get({ sessionId }).permissionMode).toBe("plan");
		const planMark = envelopes.length;
		manager.sendMessage({
			sessionId,
			message: userMessage(
				"Create a one-step, no-file-change plan whose only step is `Report PLAN_MANAGER_OK`, then call ExitPlanMode for approval. After approval, do not use any other tool and reply exactly PLAN_MANAGER_OK.",
			),
		});
		const planPermission = await waitForPermission(
			manager,
			sessionId,
			"ExitPlanMode",
		);
		manager.respondToPermission({
			sessionId,
			requestId: planPermission.requestId,
			response: {
				behavior: "allow",
				updatedInput: planPermission.input,
			},
		});
		const planResult = await waitForResult(envelopes, planMark, "plan turn");
		await waitFor(
			() => manager.get({ sessionId }).status === "idle",
			30_000,
			"plan idle state",
		);
		expect(resultText(planResult)).toContain("PLAN_MANAGER_OK");
		await manager.setPermissionMode({
			sessionId,
			permissionMode: "default",
		});

		const catalog = manager.getCatalog({ sessionId });
		expect(catalog.models.length).toBeGreaterThan(0);
		const selectedModel = catalog.models.find(({ value }) => value === "haiku");
		if (selectedModel) {
			await manager.setModel({ sessionId, model: selectedModel.value });
			expect(manager.get({ sessionId }).model).toBe(selectedModel.value);
		}

		const interruptMark = envelopes.length;
		manager.sendMessage({
			sessionId,
			message: userMessage(
				"Without tools, write the integers 1 through 500, each on its own line, with a short sentence after every integer.",
			),
		});
		await waitFor(
			() =>
				envelopes
					.slice(interruptMark)
					.some(
						({ frame }) =>
							frame.kind === "sdk" && frame.message.type === "stream_event",
					),
			TURN_TIMEOUT_MS,
			"streamed content before interrupt",
		);
		const interruptStartedAt = Date.now();
		await manager.interrupt({ sessionId });
		expect(Date.now() - interruptStartedAt).toBeLessThan(30_000);
		await waitForResult(envelopes, interruptMark, "interrupted turn");
		await waitFor(
			() => manager.get({ sessionId }).status === "idle",
			30_000,
			"post-interrupt idle state",
		);

		const afterInterrupt = await runTurn(
			"Do not use tools. Reply exactly AFTER_INTERRUPT_MANAGER_OK and nothing else.",
			"post-interrupt",
		);
		expect(resultText(afterInterrupt)).toContain("AFTER_INTERRUPT_MANAGER_OK");

		await waitFor(
			async () => {
				const history = await manager.getMessages({ sessionId, limit: 200 });
				return JSON.stringify(history.items).includes(
					"AFTER_INTERRUPT_MANAGER_OK",
				);
			},
			30_000,
			"native transcript flush",
		);

		unsubscribe();
		expect(envelopes.length).toBeGreaterThan(20);
		expect(envelopes[0]?.seq).toBe(1);
		for (let index = 1; index < envelopes.length; index += 1) {
			expect(envelopes[index]?.seq).toBe((envelopes[index - 1]?.seq ?? 0) + 1);
		}
		const timeline = foldEnvelopes(emptyTimeline(), envelopes);
		expect(timeline.meta.claudeSessionId).toBe(claudeSessionId);
		expect(timeline.items.some(({ kind }) => kind === "tool_call")).toBe(true);
	}, 600_000);
});

async function waitForPermission(
	manager: ClaudeSessionManager,
	sessionId: string,
	toolName: string,
): Promise<PendingPermissionRequest> {
	await waitFor(
		() =>
			manager
				.get({ sessionId })
				.pendingPermissions.some((request) => request.toolName === toolName),
		TURN_TIMEOUT_MS,
		`${toolName} permission`,
	);
	const request = manager
		.get({ sessionId })
		.pendingPermissions.find((pending) => pending.toolName === toolName);
	if (!request) throw new Error(`${toolName} permission disappeared`);
	return request;
}
