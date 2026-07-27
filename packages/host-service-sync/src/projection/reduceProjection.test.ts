import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { SessionEvent } from "../protocol";
import {
	ProjectionError,
	type ProjectionInput,
	projectionInputSchema,
	type SessionProjection,
	sessionProjectionSchema,
} from "./projection";
import { reduceProjection } from "./reduceProjection";

const timestamp = 1_783_772_200_000;

const GOLDEN_FIXTURES = ["turn-lifecycle", "cards-and-settings"];

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		for (const nested of Object.values(value)) {
			deepFreeze(nested);
		}
		Object.freeze(value);
	}
	return value;
}

function baseProjection(): SessionProjection {
	return sessionProjectionSchema.parse({
		sessionId: "session-1",
		cursor: "cursor-0",
		session: {
			id: "session-1",
			workspaceId: "workspace-1",
			title: "Reconnect investigation",
			mainThreadId: "thread-main",
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
				activeModel: "anthropic/claude-sonnet-4-6",
				activeMode: "default",
				effort: "low",
				configuration: {},
			},
			eventHead: "cursor-0",
			createdAt: timestamp,
			updatedAt: timestamp,
			lastActivityAt: timestamp,
			archivedAt: null,
			closedAt: null,
			error: null,
		},
		threadsById: {
			"thread-main": {
				id: "thread-main",
				sessionId: "session-1",
				kind: "main",
				parentThreadId: null,
				origin: { type: "sessionCreated" },
				fidelity: "full",
				title: null,
				runState: "idle",
				eventHead: null,
				createdAt: timestamp,
				updatedAt: timestamp,
				lastActivityAt: timestamp,
			},
		},
		activeTurnsById: {},
		pendingPermissionsById: {},
		activeToolCallsById: {},
		plan: [],
	});
}

function eventInput(
	sequence: number,
	payload: SessionEvent["payload"],
): ProjectionInput {
	return projectionInputSchema.parse({
		type: "event",
		cursor: `cursor-${sequence}`,
		value: {
			id: `event-${sequence}`,
			sessionId: "session-1",
			threadId: "thread-main",
			cursor: `cursor-${sequence}`,
			occurredAt: timestamp + sequence,
			causationId: null,
			payload,
		},
	});
}

function projectionErrorCode(run: () => unknown): string | null {
	try {
		run();
		return null;
	} catch (error) {
		if (error instanceof ProjectionError) return error.code;
		throw error;
	}
}

function permissionRequested(sequence: number, permissionId: string) {
	return eventInput(sequence, {
		type: "permissionRequested",
		permission: {
			id: permissionId,
			sessionId: "session-1",
			threadId: "thread-main",
			toolCallId: `tool-${permissionId}`,
			options: [{ id: "allow_once", name: "Allow once", kind: "allowOnce" }],
			multiSelect: false,
			requestedAt: timestamp + sequence,
		},
	});
}

describe("reduceProjection", () => {
	for (const name of GOLDEN_FIXTURES) {
		test(`golden: ${name} folds to its pinned projection`, async () => {
			const fixture = (await Bun.file(
				resolve(import.meta.dir, "fixtures", `${name}.json`),
			).json()) as { inputs: unknown[]; expected: unknown };
			let projection: SessionProjection | null = null;
			for (const rawInput of fixture.inputs) {
				projection = reduceProjection(
					projection,
					projectionInputSchema.parse(rawInput),
				);
			}
			// The reducer must emit projections its own schema accepts.
			const actual = sessionProjectionSchema.parse(projection);
			expect(actual).toEqual(sessionProjectionSchema.parse(fixture.expected));
		});
	}

	test("requires a snapshot first and rejects cross-session inputs", () => {
		const projection = baseProjection();
		const foreignEvent = projectionInputSchema.parse({
			type: "event",
			cursor: "cursor-1",
			value: {
				id: "event-1",
				sessionId: "session-other",
				threadId: "thread-other",
				cursor: "cursor-1",
				occurredAt: timestamp + 1,
				causationId: null,
				payload: {
					type: "messageCompleted",
					messageId: "message-1",
				},
			},
		});

		expect(
			projectionErrorCode(() => reduceProjection(null, foreignEvent)),
		).toBe("PROJECTION_NOT_INITIALIZED");
		expect(
			projectionErrorCode(() => reduceProjection(projection, foreignEvent)),
		).toBe("PROJECTION_SESSION_MISMATCH");
		expect(
			projectionErrorCode(() =>
				reduceProjection(projection, {
					type: "snapshot",
					cursor: "cursor-0",
					value: { ...baseProjection(), sessionId: "session-other" },
				}),
			),
		).toBe("PROJECTION_SESSION_MISMATCH");
	});

	test("treats replayed references to untracked entities as no-ops", () => {
		const projection = baseProjection();
		const afterGhostUpdate = reduceProjection(
			projection,
			eventInput(1, {
				type: "toolCallUpdated",
				toolCallId: "tool-ghost",
				update: { state: "succeeded", updatedAt: timestamp + 1 },
			}),
		);
		const afterDuplicateResolve = reduceProjection(
			afterGhostUpdate,
			eventInput(2, {
				type: "permissionResolved",
				permissionId: "permission-ghost",
				outcome: { type: "cancelled" },
			}),
		);

		expect(afterDuplicateResolve.activeToolCallsById).toEqual({});
		expect(afterDuplicateResolve.pendingPermissionsById).toEqual({});
		expect(afterDuplicateResolve.session.runState).toBe("idle");
		// Bookkeeping still advances: replay overlap must move the head.
		expect(afterDuplicateResolve.cursor).toBe("cursor-2");
		expect(afterDuplicateResolve.session.eventHead).toBe("cursor-2");
	});

	test("a terminal event for an untracked turn never terminalizes a live thread", () => {
		const started = reduceProjection(
			baseProjection(),
			eventInput(1, {
				type: "turnStarted",
				turn: {
					id: "turn-1",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "running",
					originatingClientInstanceId: null,
					createdAt: timestamp + 1,
					updatedAt: timestamp + 1,
				},
			}),
		);
		// Replay overlap: a cancellation for a turn this projection never
		// tracked must be a full no-op — not just on activeTurnsById, but on
		// the thread's run state too.
		const afterGhost = reduceProjection(
			started,
			eventInput(2, { type: "turnCancelled", turnId: "turn-ghost" }),
		);
		expect(afterGhost.threadsById["thread-main"]?.runState).toBe("running");
		expect(afterGhost.activeTurnsById["turn-1"]).toBeDefined();
		expect(afterGhost.session.runState).toBe("running");
	});

	test("never mutates the current projection or the input", () => {
		const projection = deepFreeze(baseProjection());
		const input = deepFreeze(
			eventInput(1, {
				type: "turnStarted",
				turn: {
					id: "turn-1",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "running",
					originatingClientInstanceId: "client-1",
					createdAt: timestamp + 1,
					updatedAt: timestamp + 1,
				},
			}),
		);

		const next = reduceProjection(projection, input);
		expect(next.session.runState).toBe("running");
		expect(next.threadsById["thread-main"]?.runState).toBe("running");
		expect(projection.session.runState).toBe("idle");
		expect(projection.threadsById["thread-main"]?.runState).toBe("idle");
	});

	test("tracks pending permissions and open client tool calls in the projection maps", () => {
		let projection = baseProjection();
		projection = reduceProjection(
			projection,
			permissionRequested(5, "permission-late"),
		);
		projection = reduceProjection(
			projection,
			eventInput(6, {
				type: "permissionRequested",
				permission: {
					id: "permission-early",
					sessionId: "session-1",
					threadId: "thread-main",
					toolCallId: "tool-permission-early",
					options: [
						{ id: "allow_once", name: "Allow once", kind: "allowOnce" },
					],
					multiSelect: false,
					requestedAt: timestamp + 1,
				},
			}),
		);
		projection = reduceProjection(
			projection,
			eventInput(7, {
				type: "toolCallStarted",
				toolCall: {
					id: "tool-ask",
					sessionId: "session-1",
					threadId: "thread-main",
					turnId: "turn-1",
					parentToolCallId: null,
					tool: { name: "ui.ask_user", version: 1 },
					title: "Choose storage",
					input: { question: "Which store?" },
					resolver: {
						type: "client",
						capability: "ui.ask_user",
						routing: "anyCapableClient",
					},
					state: "available",
					createdAt: timestamp + 7,
					updatedAt: timestamp + 7,
					expiresAt: null,
				},
			}),
		);

		// Attention/badging is client-derived now: the projection only carries
		// the low-level primitives — pending permissions and open tool calls.
		expect(Object.keys(projection.pendingPermissionsById).sort()).toEqual([
			"permission-early",
			"permission-late",
		]);
		expect(projection.activeToolCallsById["tool-ask"]?.state).toBe("available");

		projection = reduceProjection(
			projection,
			eventInput(8, {
				type: "permissionResolved",
				permissionId: "permission-early",
				outcome: { type: "selected", optionIds: ["allow_once"] },
			}),
		);
		expect(Object.keys(projection.pendingPermissionsById)).toEqual([
			"permission-late",
		]);
	});

	test("surfaces a failed turn's error and clears it when a new turn starts", () => {
		let projection = reduceProjection(
			baseProjection(),
			eventInput(1, {
				type: "turnStarted",
				turn: {
					id: "turn-1",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "running",
					originatingClientInstanceId: null,
					createdAt: timestamp + 1,
					updatedAt: timestamp + 1,
				},
			}),
		);
		projection = reduceProjection(
			projection,
			eventInput(2, {
				type: "turnFailed",
				turnId: "turn-1",
				error: {
					code: "ADAPTER_PROTOCOL_ERROR",
					retryable: true,
					recovery: "retry",
					occurredAt: timestamp + 2,
				},
			}),
		);
		expect(projection.session.runState).toBe("idle");
		expect(projection.session.error?.code).toBe("ADAPTER_PROTOCOL_ERROR");
		expect(projection.threadsById["thread-main"]?.runState).toBe("failed");
		expect(projection.activeTurnsById).toEqual({});

		projection = reduceProjection(
			projection,
			eventInput(3, {
				type: "turnStarted",
				turn: {
					id: "turn-2",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "accepted",
					originatingClientInstanceId: "client-1",
					createdAt: timestamp + 3,
					updatedAt: timestamp + 3,
				},
			}),
		);
		expect(projection.session.error).toBeNull();
		expect(projection.session.runState).toBe("running");
	});
});
