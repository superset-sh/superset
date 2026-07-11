import { describe, expect, test } from "bun:test";
import type {
	SessionCatalog,
	SessionScopedState,
	SessionsApi,
} from "@superset/session-protocol";
import { TRPCError } from "@trpc/server";
import {
	SessionCursorError,
	SessionNotFoundError,
	SessionUnavailableError,
	SessionWorkspaceMismatchError,
} from "../../../runtime/sessions";
import { sessionsRouter } from "./sessions";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CLAUDE_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

const STATE: SessionScopedState = {
	sessionId: SESSION_ID,
	claudeSessionId: CLAUDE_SESSION_ID,
	workspaceId: WORKSPACE_ID,
	harness: "claude",
	status: "idle",
	model: "sonnet",
	permissionMode: "default",
	effort: null,
	pendingPermissions: [],
	pendingUserDialogs: [],
	pendingElicitations: [],
	cwd: "/tmp/workspace-1",
	lastSeq: 1,
	lastError: null,
	createdAt: 1,
	updatedAt: 1,
};

const CATALOG: SessionCatalog = {
	models: [],
	commands: [],
	agents: [],
	permissionModes: ["default"],
};

interface Calls {
	list: unknown[];
	create: unknown[];
	retry: unknown[];
	sendMessage: unknown[];
	setModel: unknown[];
}

function createSessions(overrides: Partial<SessionsApi> = {}): {
	sessions: SessionsApi;
	calls: Calls;
} {
	const calls: Calls = {
		list: [],
		create: [],
		retry: [],
		sendMessage: [],
		setModel: [],
	};
	const sessions: SessionsApi = {
		list: (input = {}) => {
			calls.list.push(input);
			return Promise.resolve({ items: [STATE], nextCursor: null });
		},
		create: (input) => {
			calls.create.push(input);
			return Promise.resolve(STATE);
		},
		retry: (input) => {
			calls.retry.push(input);
			return Promise.resolve(STATE);
		},
		get: () => Promise.resolve(STATE),
		getMessages: () => Promise.resolve({ items: [], nextCursor: null }),
		sendMessage: (input) => {
			calls.sendMessage.push(input);
			return Promise.resolve({ accepted: true });
		},
		respondToPermission: () => Promise.resolve({ status: "resolved" }),
		respondToUserDialog: () => Promise.resolve({ status: "resolved" }),
		respondToElicitation: () => Promise.resolve({ status: "resolved" }),
		interrupt: () => Promise.resolve(),
		setModel: (input) => {
			calls.setModel.push(input);
			return Promise.resolve();
		},
		setPermissionMode: () => Promise.resolve(),
		getCatalog: () => Promise.resolve(CATALOG),
		...overrides,
	};
	return { sessions, calls };
}

function createCaller(sessions: SessionsApi, isAuthenticated = true) {
	return sessionsRouter.createCaller({
		isAuthenticated,
		runtime: { sessions },
	} as unknown as Parameters<typeof sessionsRouter.createCaller>[0]);
}

describe("sessionsRouter", () => {
	test("protects the entire SDK session surface", async () => {
		const { sessions } = createSessions();
		await expect(
			createCaller(sessions, false).get({ sessionId: SESSION_ID }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	test("validates and forwards SDK-shaped inputs with pagination defaults", async () => {
		const { sessions, calls } = createSessions();
		const caller = createCaller(sessions);

		expect(await caller.list({})).toEqual({
			items: [STATE],
			nextCursor: null,
		});
		expect(
			await caller.create({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
				model: "sonnet",
				permissionMode: "plan",
			}),
		).toEqual(STATE);
		expect(
			await caller.sendMessage({
				sessionId: SESSION_ID,
				message: {
					type: "user",
					message: { role: "user", content: "hello" },
					parent_tool_use_id: null,
				},
			}),
		).toEqual({ accepted: true });
		expect(await caller.retry({ sessionId: SESSION_ID })).toEqual(STATE);
		await caller.setModel({ sessionId: SESSION_ID });

		expect(calls.list).toEqual([{ limit: 50 }]);
		expect(calls.create).toEqual([
			{
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
				model: "sonnet",
				permissionMode: "plan",
			},
		]);
		expect(calls.sendMessage).toHaveLength(1);
		expect(calls.retry).toEqual([{ sessionId: SESSION_ID }]);
		expect(calls.setModel).toEqual([{ sessionId: SESSION_ID }]);
	});

	test("maps manager errors to stable tRPC codes", async () => {
		const cases = [
			[new SessionNotFoundError("missing"), "NOT_FOUND"],
			[new SessionUnavailableError("not ready"), "PRECONDITION_FAILED"],
			[new SessionWorkspaceMismatchError("wrong workspace"), "CONFLICT"],
			[new SessionCursorError("bad cursor"), "BAD_REQUEST"],
		] as const;

		for (const [error, code] of cases) {
			const { sessions } = createSessions({
				get: () => {
					throw error;
				},
			});
			try {
				await createCaller(sessions).get({ sessionId: SESSION_ID });
				throw new Error("expected the sessions router to reject");
			} catch (caught) {
				expect(caught).toBeInstanceOf(TRPCError);
				expect((caught as TRPCError).code).toBe(code);
				expect((caught as TRPCError).message).toBe(error.message);
			}
		}
	});

	test("rejects malformed SDK user messages before the manager", async () => {
		const { sessions, calls } = createSessions();
		await expect(
			createCaller(sessions).sendMessage({
				sessionId: SESSION_ID,
				message: {
					type: "user",
					message: { role: "assistant", content: "invalid" },
					parent_tool_use_id: null,
				} as never,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(calls.sendMessage).toEqual([]);
	});

	test("retry accepts only the Superset session id", async () => {
		const { sessions, calls } = createSessions();
		await expect(
			createCaller(sessions).retry({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
			} as never),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(calls.retry).toEqual([]);
	});
});
