import { describe, expect, test } from "bun:test";
import {
	reduceProjection,
	type SessionProjection,
	sessionEventSchema,
} from "@superset/host-service-sync";
import type {
	SessionScopedState,
	SessionUpdate,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
import {
	AcpSessionEventTranslator,
	acpMainThreadId,
	type SessionEventDraft,
} from "./translate-acp";

const SESSION_ID = "session-test";
const MAIN_THREAD_ID = acpMainThreadId(SESSION_ID);
const T0 = 1_784_000_000_000;

function makeTranslator() {
	return new AcpSessionEventTranslator({
		sessionId: SESSION_ID,
		idScope: "scope1",
	});
}

/** Envelope factory with auto-incrementing seq/ts, mirroring the journal. */
function makeJournal() {
	let seq = 0;
	return (frame: SessionUpdateFrame): SessionUpdateEnvelope => {
		seq += 1;
		return { seq, sessionId: SESSION_ID, ts: T0 + seq, frame };
	};
}

function update(u: SessionUpdate): SessionUpdateFrame {
	return { kind: "update", update: u };
}

function stateFrame(
	overrides: Partial<SessionScopedState>,
): SessionUpdateFrame {
	return {
		kind: "state",
		state: {
			sessionId: SESSION_ID,
			workspaceId: "workspace-test",
			harness: "claude-agent-acp",
			status: "idle",
			title: null,
			currentMode: null,
			configOptions: [],
			pendingPermissions: [],
			cwd: "/tmp/workspace",
			lastSeq: 0,
			lastStopReason: null,
			lastError: null,
			createdAt: T0,
			updatedAt: T0,
			...overrides,
		},
	};
}

function baselineProjection(): SessionProjection {
	return {
		sessionId: SESSION_ID,
		cursor: "cursor-0",
		session: {
			id: SESSION_ID,
			workspaceId: "workspace-test",
			title: null,
			mainThreadId: MAIN_THREAD_ID,
			agent: { id: "claude-code", displayName: "Claude Code" },
			runState: "idle",
			capabilities: {
				threadModel: "nested",
				threadFidelity: "partial",
				canResume: true,
				supportsPermissions: true,
				supportsModes: true,
				supportsModels: true,
			},
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
			eventHead: null,
			createdAt: T0,
			updatedAt: T0,
			lastActivityAt: T0,
			archivedAt: null,
			closedAt: null,
			error: null,
		},
		threadsById: {
			[MAIN_THREAD_ID]: {
				id: MAIN_THREAD_ID,
				sessionId: SESSION_ID,
				kind: "main",
				parentThreadId: null,
				origin: { type: "sessionCreated" },
				fidelity: "full",
				title: null,
				runState: "idle",
				eventHead: null,
				createdAt: T0,
				updatedAt: T0,
				lastActivityAt: T0,
			},
		},
		activeTurnsById: {},
		pendingPermissionsById: {},
		activeToolCallsById: {},
		plan: [],
	};
}

/**
 * The contract every translated batch must honor: each draft is a
 * schema-valid SessionEvent once a cursor is assigned, and the whole stream
 * folds through the shared projection reducer without throwing.
 */
function validateAndFold(drafts: SessionEventDraft[]): SessionProjection {
	let projection = baselineProjection();
	drafts.forEach((draft, index) => {
		const event = sessionEventSchema.parse({
			...draft,
			cursor: `cursor-${index + 1}`,
		});
		projection = reduceProjection(projection, {
			type: "event",
			cursor: event.cursor,
			value: event,
		});
	});
	return projection;
}

function translateAll(
	translator: AcpSessionEventTranslator,
	envelopes: SessionUpdateEnvelope[],
): SessionEventDraft[] {
	return envelopes.flatMap((envelope) => translator.translate(envelope));
}

function payloadTypes(drafts: SessionEventDraft[]): string[] {
	return drafts.map((draft) => draft.payload.type);
}

function only<T extends SessionEventDraft["payload"]["type"]>(
	drafts: SessionEventDraft[],
	type: T,
): Extract<SessionEventDraft["payload"], { type: T }>[] {
	return drafts
		.filter((draft) => draft.payload.type === type)
		.map(
			(draft) =>
				draft.payload as Extract<SessionEventDraft["payload"], { type: T }>,
		);
}

function firstOf<T extends SessionEventDraft["payload"]["type"]>(
	drafts: SessionEventDraft[],
	type: T,
): Extract<SessionEventDraft["payload"], { type: T }> {
	const found = only(drafts, type)[0];
	if (!found) throw new Error(`expected a ${type} event in the batch`);
	return found;
}

describe("AcpSessionEventTranslator", () => {
	test("full turn lifecycle: prompt, thought, tool with permission, completion", () => {
		const translator = makeTranslator();
		const env = makeJournal();
		translator.attributeNextTurn({
			requestId: "request-send-1",
			clientInstanceId: "client-instance-1",
		});

		const promptPhase = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "Write the config file" },
				}),
			),
			env(stateFrame({ status: "running" })),
			env(
				update({
					sessionUpdate: "agent_thought_chunk",
					content: { type: "text", text: "Planning the write..." },
					messageId: "acp-msg-1",
				}),
			),
			env(
				update({
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Writing config.json now." },
					messageId: "acp-msg-1",
				}),
			),
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_write_1",
					title: "Write config.json",
					kind: "edit",
					status: "pending",
					rawInput: { path: "config.json" },
					_meta: { claudeCode: { toolName: "Write" } },
				}),
			),
		]);

		// Main thread created first, then the attributed turn, then messages.
		expect(payloadTypes(promptPhase)).toEqual([
			"threadCreated",
			"turnStarted",
			"messageStarted",
			"messageDelta",
			"settingsUpdated",
			"messageCompleted", // user message closes when the assistant speaks
			"messageStarted",
			"messageDelta",
			"messageDelta",
			"toolCallStarted",
		]);
		const turn = firstOf(promptPhase, "turnStarted");
		expect(turn.turn.originatingClientInstanceId).toBe("client-instance-1");
		const turnStartDraft = promptPhase.find(
			(draft) => draft.payload.type === "turnStarted",
		);
		expect(turnStartDraft?.causationId).toBe("request-send-1");
		const userMessageStart = promptPhase.find(
			(draft) => draft.payload.type === "messageStarted",
		);
		expect(userMessageStart?.causationId).toBe("request-send-1");

		// Thought and prose interleave in ONE assistant message (same messageId).
		const assistantDeltas = only(promptPhase, "messageDelta").slice(1);
		expect(assistantDeltas.map((delta) => delta.content.type)).toEqual([
			"thought",
			"text",
		]);
		const messageStarts = only(promptPhase, "messageStarted");
		expect(new Set(messageStarts.map((start) => start.message.id)).size).toBe(
			2,
		);

		const toolStart = firstOf(promptPhase, "toolCallStarted");
		expect(toolStart.toolCall.id).toBe("toolu_write_1");
		expect(toolStart.toolCall.tool.name).toBe("Write");
		expect(toolStart.toolCall.state).toBe("requested");
		expect(toolStart.toolCall.input).toEqual({ path: "config.json" });

		const permissionPhase = translateAll(translator, [
			env({
				kind: "permission_requested",
				pending: {
					requestId: "42",
					toolCall: { toolCallId: "toolu_write_1", title: "Write config.json" },
					options: [
						{ optionId: "allow", name: "Allow", kind: "allow_once" },
						{ optionId: "reject", name: "Reject", kind: "reject_once" },
					],
					requestedAt: T0 + 6,
				},
			}),
			env(stateFrame({ status: "awaiting_permission" })),
		]);
		expect(payloadTypes(permissionPhase)).toEqual([
			"toolCallUpdated",
			"permissionRequested",
		]);
		const awaiting = firstOf(permissionPhase, "toolCallUpdated");
		expect(awaiting.update.state).toBe("awaitingPermission");
		const permission = firstOf(permissionPhase, "permissionRequested");
		expect(permission.permission.toolCallId).toBe("toolu_write_1");
		expect(permission.permission.multiSelect).toBe(false);
		expect(permission.permission.options.map((option) => option.kind)).toEqual([
			"allowOnce",
			"rejectOnce",
		]);
		expect(translator.publicPermissionId("42")).toBe(permission.permission.id);

		translator.attributePermissionResolution("42", "request-resolve-1");
		const finishPhase = translateAll(translator, [
			env({
				kind: "permission_resolved",
				requestId: "42",
				outcome: { outcome: "selected", optionId: "allow" },
			}),
			env(stateFrame({ status: "running" })),
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_write_1",
					status: "completed",
					rawOutput: { ok: true },
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "end_turn" })),
		]);
		expect(payloadTypes(finishPhase)).toEqual([
			"permissionResolved",
			"toolCallUpdated",
			"messageCompleted",
			"turnCompleted",
		]);
		const resolved = firstOf(finishPhase, "permissionResolved");
		expect(resolved.permissionId).toBe(permission.permission.id);
		expect(resolved.outcome).toEqual({
			type: "selected",
			optionIds: ["allow"],
		});
		const resolvedDraft = finishPhase.find(
			(draft) => draft.payload.type === "permissionResolved",
		);
		expect(resolvedDraft?.causationId).toBe("request-resolve-1");
		expect(translator.publicPermissionId("42")).toBeNull();
		const completedTurn = firstOf(finishPhase, "turnCompleted");
		expect(completedTurn.turnId).toBe(turn.turn.id);
		expect(completedTurn.stopReason).toBe("endTurn");

		const projection = validateAndFold([
			...promptPhase,
			...permissionPhase,
			...finishPhase,
		]);
		expect(projection.session.runState).toBe("idle");
		expect(projection.session.error).toBeNull();
		expect(projection.activeTurnsById).toEqual({});
		expect(projection.pendingPermissionsById).toEqual({});
		expect(projection.activeToolCallsById).toEqual({});
		expect(projection.threadsById[MAIN_THREAD_ID]?.runState).toBe("completed");
	});

	test("subagent Task activity lands in a partial-fidelity child thread", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		const drafts = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "Explore the repo" },
				}),
			),
			env(stateFrame({ status: "running" })),
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_task_1",
					title: "Explore packages",
					kind: "other",
					status: "in_progress",
					rawInput: { description: "Explore packages" },
					_meta: { claudeCode: { toolName: "Task" } },
				}),
			),
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_child_grep",
					title: "grep -r sessions",
					kind: "search",
					status: "in_progress",
					_meta: {
						claudeCode: { toolName: "Grep", parentToolUseId: "toolu_task_1" },
					},
				}),
			),
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_child_grep",
					status: "completed",
					_meta: {
						claudeCode: { parentToolUseId: "toolu_task_1" },
					},
				}),
			),
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_task_1",
					status: "completed",
					rawOutput: { summary: "done" },
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "end_turn" })),
		]);

		const threadsCreated = only(drafts, "threadCreated");
		expect(threadsCreated).toHaveLength(2);
		const subagentThread = threadsCreated[1]?.thread;
		expect(subagentThread).toMatchObject({
			id: "thread-sub-toolu_task_1",
			kind: "subagent",
			parentThreadId: MAIN_THREAD_ID,
			fidelity: "partial",
			title: "Explore packages",
			runState: "running",
		});
		const taskStart = drafts.find(
			(draft) =>
				draft.payload.type === "toolCallStarted" &&
				draft.payload.toolCall.id === "toolu_task_1",
		);
		expect(subagentThread?.origin).toEqual({
			type: "subagent",
			spawnedByEventId: taskStart?.id ?? "",
			spawnedByToolCallId: "toolu_task_1",
		});

		// Child tool activity routes to the subagent thread, with parent linkage.
		const childStart = drafts.find(
			(draft) =>
				draft.payload.type === "toolCallStarted" &&
				draft.payload.toolCall.id === "toolu_child_grep",
		);
		expect(childStart?.threadId).toBe("thread-sub-toolu_task_1");
		expect(
			childStart?.payload.type === "toolCallStarted"
				? childStart.payload.toolCall.parentToolCallId
				: null,
		).toBe("toolu_task_1");

		// Task completion closes the child thread.
		const threadUpdates = only(drafts, "threadUpdated");
		expect(threadUpdates).toHaveLength(1);
		expect(threadUpdates[0]?.thread.runState).toBe("completed");

		const projection = validateAndFold(drafts);
		expect(projection.threadsById["thread-sub-toolu_task_1"]?.runState).toBe(
			"completed",
		);
		expect(projection.session.runState).toBe("idle");
		expect(projection.activeToolCallsById).toEqual({});
	});

	test("synthetic elicitation card becomes a ui.question tool call", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		const asked = translateAll(translator, [
			env(stateFrame({ status: "running" })),
			env({
				kind: "permission_requested",
				pending: {
					requestId: "elicit-req-1",
					toolCall: {
						toolCallId: "elicitation-abc",
						title: "Which storage backend?",
					},
					options: [
						{ optionId: "sqlite", name: "SQLite", kind: "allow_once" },
						{ optionId: "postgres", name: "Postgres", kind: "allow_once" },
						{ optionId: "reject", name: "Cancel", kind: "reject_once" },
					],
					requestedAt: T0 + 2,
					multiSelect: true,
				},
			}),
		]);
		const toolStart = firstOf(asked, "toolCallStarted");
		expect(toolStart.toolCall.tool.name).toBe("ui.question");
		expect(toolStart.toolCall.title).toBe("Which storage backend?");
		expect(toolStart.toolCall.state).toBe("awaitingPermission");
		const permission = firstOf(asked, "permissionRequested");
		expect(permission.permission.multiSelect).toBe(true);
		expect(permission.permission.toolCallId).toBe("elicitation-abc");

		const answered = translateAll(translator, [
			env({
				kind: "permission_resolved",
				requestId: "elicit-req-1",
				outcome: makeSelectedOutcome(["sqlite", "postgres"]),
			}),
			// The manager journals a terminal update for the synthetic card.
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "elicitation-abc",
					status: "completed",
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "end_turn" })),
		]);
		const resolved = firstOf(answered, "permissionResolved");
		expect(resolved.outcome).toEqual({
			type: "selected",
			optionIds: ["sqlite", "postgres"],
		});

		const projection = validateAndFold([...asked, ...answered]);
		expect(projection.pendingPermissionsById).toEqual({});
		expect(projection.activeToolCallsById).toEqual({});
	});

	test("prompt_rejected fails the turn once; auth failures map to AUTH_REQUIRED", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		const drafts = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "hello" },
				}),
			),
			env(stateFrame({ status: "running" })),
			env({
				kind: "prompt_rejected",
				reason: "Authentication required: please run /login",
				promptStartSeq: 1,
			}),
			// The manager's finally-block state frame lands after the rejection.
			env(stateFrame({ status: "idle", lastError: "Authentication required" })),
		]);

		const failures = only(drafts, "turnFailed");
		expect(failures).toHaveLength(1);
		expect(failures[0]?.error).toMatchObject({
			code: "AUTH_REQUIRED",
			retryable: false,
			recovery: "reauthenticate",
		});
		// No second turn event from the trailing state frame.
		expect(only(drafts, "turnCompleted")).toHaveLength(0);
		expect(only(drafts, "turnCancelled")).toHaveLength(0);

		const projection = validateAndFold(drafts);
		expect(projection.session.error?.code).toBe("AUTH_REQUIRED");
		expect(projection.session.runState).toBe("idle");
		expect(projection.threadsById[MAIN_THREAD_ID]?.runState).toBe("failed");
	});

	test("cancel settles pending permissions then cancels the turn", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		const drafts = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "run something risky" },
				}),
			),
			env(stateFrame({ status: "running" })),
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_bash_1",
					title: "rm -rf ./build",
					kind: "execute",
					status: "pending",
					_meta: { claudeCode: { toolName: "Bash" } },
				}),
			),
			env({
				kind: "permission_requested",
				pending: {
					requestId: "7",
					toolCall: { toolCallId: "toolu_bash_1" },
					options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
					requestedAt: T0 + 4,
				},
			}),
			env({
				kind: "permission_resolved",
				requestId: "7",
				outcome: { outcome: "cancelled" },
			}),
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_bash_1",
					status: "failed",
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "cancelled" })),
		]);

		const resolved = firstOf(drafts, "permissionResolved");
		expect(resolved.outcome).toEqual({ type: "cancelled" });
		expect(only(drafts, "turnCancelled")).toHaveLength(1);
		expect(only(drafts, "turnFailed")).toHaveLength(0);

		const projection = validateAndFold(drafts);
		expect(projection.session.runState).toBe("idle");
		expect(projection.threadsById[MAIN_THREAD_ID]?.runState).toBe("cancelled");
	});

	test("settings derive from state frames, dedupe, and carry attribution", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		const modelOption = {
			id: "model",
			name: "Model",
			category: "model" as const,
			type: "select" as const,
			currentValue: "claude-sonnet-4-6",
			options: [
				{ value: "claude-sonnet-4-6", name: "Sonnet" },
				{ value: "claude-opus-4-8", name: "Opus" },
			],
		};

		const first = translateAll(translator, [
			env(
				stateFrame({
					status: "idle",
					currentMode: {
						currentModeId: "default",
						availableModes: [{ id: "default", name: "Default" }],
					},
					configOptions: [modelOption],
				}),
			),
		]);
		const initial = firstOf(first, "settingsUpdated");
		expect(initial.settings).toEqual({
			activeModel: "claude-sonnet-4-6",
			activeMode: "default",
			effort: null,
			configuration: { model: "claude-sonnet-4-6" },
		});

		// Identical state frame: no duplicate settings event.
		const repeat = translateAll(translator, [
			env(
				stateFrame({
					status: "idle",
					currentMode: {
						currentModeId: "default",
						availableModes: [{ id: "default", name: "Default" }],
					},
					configOptions: [modelOption],
				}),
			),
		]);
		expect(only(repeat, "settingsUpdated")).toHaveLength(0);

		translator.attributeNextSettingsChange("request-model-1");
		const changed = translateAll(translator, [
			env(
				stateFrame({
					status: "idle",
					currentMode: {
						currentModeId: "acceptEdits",
						availableModes: [{ id: "acceptEdits", name: "Accept Edits" }],
					},
					configOptions: [{ ...modelOption, currentValue: "claude-opus-4-8" }],
				}),
			),
		]);
		const changedDraft = changed.find(
			(draft) => draft.payload.type === "settingsUpdated",
		);
		expect(changedDraft?.causationId).toBe("request-model-1");
		const updated = firstOf(changed, "settingsUpdated");
		expect(updated.settings.activeModel).toBe("claude-opus-4-8");
		expect(updated.settings.activeMode).toBe("acceptEdits");

		const projection = validateAndFold([...first, ...repeat, ...changed]);
		expect(projection.session.settings.activeModel).toBe("claude-opus-4-8");
	});

	test("adapter death fails the active turn; between-turn death surfaces an error once", () => {
		const midTurn = makeTranslator();
		const env = makeJournal();
		const drafts = translateAll(midTurn, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "long task" },
				}),
			),
			env(stateFrame({ status: "running" })),
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_slow_1",
					title: "Slow read",
					kind: "read",
					status: "in_progress",
					_meta: { claudeCode: { toolName: "Read" } },
				}),
			),
			// markDead terminalizes open tools before the dead state frame.
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_slow_1",
					status: "failed",
				}),
			),
			env(
				stateFrame({ status: "dead", lastError: "adapter exited with code 1" }),
			),
		]);
		const failures = only(drafts, "turnFailed");
		expect(failures).toHaveLength(1);
		expect(failures[0]?.error).toMatchObject({
			code: "ADAPTER_UNAVAILABLE",
			recovery: "startNewSession",
		});
		const projection = validateAndFold(drafts);
		expect(projection.session.error?.code).toBe("ADAPTER_UNAVAILABLE");
		expect(projection.activeToolCallsById).toEqual({});

		const betweenTurns = makeTranslator();
		const env2 = makeJournal();
		const quietDeath = translateAll(betweenTurns, [
			env2(stateFrame({ status: "idle" })),
			env2(stateFrame({ status: "dead", lastError: "adapter exited" })),
			// A repeated dead frame must not emit a second error.
			env2(stateFrame({ status: "dead", lastError: "adapter exited" })),
		]);
		expect(only(quietDeath, "error")).toHaveLength(1);
		expect(only(quietDeath, "turnFailed")).toHaveLength(0);
		const quietProjection = validateAndFold(quietDeath);
		expect(quietProjection.session.error?.code).toBe("ADAPTER_UNAVAILABLE");
	});

	test("replayed transcripts recover turn boundaries; output is deterministic", () => {
		// session/load replays the transcript with no state frames at all.
		const replayEnvelopes = (() => {
			const env = makeJournal();
			return [
				env(
					update({
						sessionUpdate: "user_message_chunk",
						content: { type: "text", text: "first ask" },
					}),
				),
				env(
					update({
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: "first answer" },
						messageId: "replay-msg-1",
					}),
				),
				env(
					update({
						sessionUpdate: "user_message_chunk",
						content: { type: "text", text: "second ask" },
					}),
				),
				env(
					update({
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: "second answer" },
						messageId: "replay-msg-2",
					}),
				),
			];
		})();

		const first = translateAll(makeTranslator(), replayEnvelopes);
		const second = translateAll(makeTranslator(), replayEnvelopes);
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));

		// The second user message closes the first turn (replay segmentation).
		const turnStarts = only(first, "turnStarted");
		expect(turnStarts).toHaveLength(2);
		const segmented = firstOf(first, "turnCompleted");
		expect(segmented.turnId).toBe(firstOf(first, "turnStarted").turn.id);
		expect(segmented.stopReason).toBe("other");

		// Second turn stays open (replay ends mid-conversation state).
		const projection = validateAndFold(first);
		expect(Object.keys(projection.activeTurnsById)).toHaveLength(1);
		expect(projection.session.runState).toBe("running");
	});

	test("audio chunks and unknown tool ids degrade without breaking the fold", () => {
		const translator = makeTranslator();
		const env = makeJournal();
		const drafts = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "audio", mimeType: "audio/wav", data: "UklGRg==" },
				}),
			),
			// Update for a tool call this incarnation never saw: forwarded, and
			// the reducer treats it as an idempotent no-op.
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_from_before_restart",
					status: "failed",
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "end_turn" })),
		]);

		// Audio has no canonical block: the message opens but carries no delta.
		expect(only(drafts, "messageStarted")).toHaveLength(1);
		expect(only(drafts, "messageDelta")).toHaveLength(0);

		const projection = validateAndFold(drafts);
		expect(projection.activeToolCallsById).toEqual({});
		expect(projection.session.runState).toBe("idle");
	});

	test("oversize rawOutput is dropped to null at the normalization boundary", () => {
		const translator = makeTranslator();
		const env = makeJournal();
		const drafts = translateAll(translator, [
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_big",
					title: "Big output",
					status: "in_progress",
					rawInput: { command: "generate" },
				}),
			),
			env(
				update({
					sessionUpdate: "tool_call_update",
					toolCallId: "toolu_big",
					status: "completed",
					rawOutput: { blob: "x".repeat(300 * 1024) },
				}),
			),
			env(stateFrame({ status: "idle", lastStopReason: "end_turn" })),
		]);

		const terminal = only(drafts, "toolCallUpdated").find(
			(payload) => payload.update.state === "succeeded",
		);
		if (!terminal) throw new Error("expected a terminal tool_call_updated");
		// Dropped, not truncated (a JSON prefix is not JSON) and not forwarded
		// (one giant event would force-close every sync subscriber's socket).
		expect(terminal.update.output).toBeNull();
		// The small input survived untouched on the started event.
		expect(firstOf(drafts, "toolCallStarted").toolCall.input).toEqual({
			command: "generate",
		});
		validateAndFold(drafts);
	});

	test("lookup surface: turnIdFor, knowsTurn, nativePermissionRequestId, merged-prompt causation", () => {
		const translator = makeTranslator();
		const env = makeJournal();

		translator.attributeNextTurn({
			requestId: "request-send-1",
			clientInstanceId: null,
		});
		const first = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "first prompt" },
				}),
			),
			env(stateFrame({ status: "running" })),
		]);
		const firstTurn = firstOf(first, "turnStarted").turn.id;
		expect(translator.turnIdFor("request-send-1")).toBe(firstTurn);
		expect(translator.activeTurnId()).toBe(firstTurn);
		expect(translator.knowsTurn(firstTurn)).toBe(true);
		expect(translator.knowsTurn("turn-from-another-incarnation")).toBe(false);
		expect(translator.turnIdFor("request-never-sent")).toBeNull();

		// A second prompt admitted into the still-open turn: the request maps to
		// the existing turn and the user message carries the new request id.
		translator.attributeNextTurn({
			requestId: "request-send-2",
			clientInstanceId: null,
		});
		const merged = translateAll(translator, [
			env(
				update({
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "second prompt, same turn" },
				}),
			),
		]);
		expect(only(merged, "turnStarted")).toHaveLength(0);
		expect(translator.turnIdFor("request-send-2")).toBe(firstTurn);
		const mergedStart = merged.find(
			(draft) => draft.payload.type === "messageStarted",
		);
		expect(mergedStart?.causationId).toBe("request-send-2");
		const mergedDelta = merged.find(
			(draft) => draft.payload.type === "messageDelta",
		);
		expect(mergedDelta?.causationId).toBe("request-send-2");

		// Permission id round-trip: public id ↔ native JSON-RPC request id.
		const permission = translateAll(translator, [
			env(
				update({
					sessionUpdate: "tool_call",
					toolCallId: "toolu_perm_1",
					title: "Run tests",
					kind: "execute",
					status: "pending",
				}),
			),
			env({
				kind: "permission_requested",
				pending: {
					requestId: "7",
					toolCall: { toolCallId: "toolu_perm_1" },
					options: [
						{ optionId: "allow", name: "Allow", kind: "allow_once" },
						{ optionId: "reject", name: "Reject", kind: "reject_once" },
					],
					requestedAt: T0 + 100,
				},
			}),
		]);
		const publicId = firstOf(permission, "permissionRequested").permission.id;
		expect(translator.nativePermissionRequestId(publicId)).toBe("7");
		expect(translator.nativePermissionRequestId("permission-unknown")).toBe(
			null,
		);

		// Resolution clears the mapping.
		translateAll(translator, [
			env({
				kind: "permission_resolved",
				requestId: "7",
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		]);
		expect(translator.nativePermissionRequestId(publicId)).toBeNull();
	});
});
