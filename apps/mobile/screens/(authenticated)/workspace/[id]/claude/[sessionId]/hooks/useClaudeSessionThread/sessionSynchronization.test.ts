import { describe, expect, test } from "bun:test";
import type {
	SessionScopedState,
	SessionsApi,
} from "@superset/session-protocol";
import {
	createOrRecoverSessionState,
	isSessionSynchronizationReady,
	sessionSynchronizationRetryDelayMs,
} from "./sessionSynchronization";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

const ERRORED_STATE: SessionScopedState = {
	sessionId: SESSION_ID,
	claudeSessionId: "00000000-0000-4000-8000-000000000003",
	workspaceId: WORKSPACE_ID,
	harness: "claude",
	status: "errored",
	model: null,
	permissionMode: "default",
	effort: null,
	pendingPermissions: [],
	pendingUserDialogs: [],
	pendingElicitations: [],
	cwd: "/tmp/workspace",
	lastSeq: 1,
	lastError: "Claude initialization failed",
	createdAt: 1,
	updatedAt: 2,
};

describe("session synchronization", () => {
	test("recovers an errored host tombstone when create rejects", async () => {
		const calls: string[] = [];
		const api = {
			create: async () => {
				calls.push("create");
				throw new Error("Claude initialization failed");
			},
			get: async () => {
				calls.push("get");
				return ERRORED_STATE;
			},
		} satisfies Pick<SessionsApi, "create" | "get">;

		expect(
			await createOrRecoverSessionState(api, {
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
			}),
		).toEqual(ERRORED_STATE);
		expect(calls).toEqual(["create", "get"]);
	});

	test("preserves the create failure when no matching tombstone is readable", async () => {
		const createFailure = new Error("relay unavailable");
		const api = {
			create: async () => {
				throw createFailure;
			},
			get: async () => ({ ...ERRORED_STATE, workspaceId: "other-workspace" }),
		} satisfies Pick<SessionsApi, "create" | "get">;

		expect(
			createOrRecoverSessionState(api, {
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
			}),
		).rejects.toBe(createFailure);
	});

	test("backs off failed full synchronization with a hard cap", () => {
		expect(
			[1, 2, 3, 4, 5, 6, 7].map(sessionSynchronizationRetryDelayMs),
		).toEqual([250, 500, 1_000, 2_000, 4_000, 8_000, 10_000]);
		expect(sessionSynchronizationRetryDelayMs(100)).toBe(10_000);
		expect(() => sessionSynchronizationRetryDelayMs(0)).toThrow();
	});

	test("requires host, hydration, and an open stream for mutations", () => {
		expect(
			isSessionSynchronizationReady({
				hostOnline: true,
				historyHydrated: true,
				streamStatus: "open",
			}),
		).toBe(true);
		for (const input of [
			{
				hostOnline: false,
				historyHydrated: true,
				streamStatus: "open" as const,
			},
			{
				hostOnline: true,
				historyHydrated: false,
				streamStatus: "open" as const,
			},
			{
				hostOnline: true,
				historyHydrated: true,
				streamStatus: "reconnecting" as const,
			},
		]) {
			expect(isSessionSynchronizationReady(input)).toBe(false);
		}
	});
});
