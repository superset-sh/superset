import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";

// --- ids -------------------------------------------------------------------
const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
// A v2 workspace that exists locally (host.db) but NOT cloud-side. Post
// local-first migration the cloud `v2_workspaces` table is empty for the org,
// so its FK from `chat_sessions.v2_workspace_id` can never be satisfied.
const LOCAL_ONLY_V2_WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";
const CLOUD_V2_WORKSPACE_ID = "66666666-6666-4666-8666-666666666666";

// The set of v2 workspace ids that actually exist in the cloud table. The
// insert mock below models the real FK: inserting a `v2_workspace_id` that is
// not in this set throws a DrizzleQueryError, exactly like Postgres does.
let existingCloudWorkspaces = new Set<string>();

let lastInsertValues: Record<string, unknown> | null = null;

function makeTx() {
	const insert = mock(() => ({
		values: (values: Record<string, unknown>) => ({
			onConflictDoNothing: () => ({
				returning: async () => {
					const v2WorkspaceId = values.v2WorkspaceId as string | null;
					if (v2WorkspaceId && !existingCloudWorkspaces.has(v2WorkspaceId)) {
						throw new Error(
							'Failed query: insert into "chat_sessions" ("id", ...) ' +
								'values (...) on conflict do nothing returning "id" - ' +
								'insert or update on table "chat_sessions" violates foreign ' +
								'key constraint "chat_sessions_v2_workspace_id_v2_workspaces_id_fk"',
						);
					}
					lastInsertValues = values;
					return [{ id: values.id }];
				},
			}),
		}),
	}));

	const select = mock(() => ({
		from: () => ({
			where: () => ({
				limit: async () =>
					[...existingCloudWorkspaces].map((id) => ({ id })).slice(0, 1),
			}),
		}),
	}));

	return { insert, select };
}

const transactionMock = mock(
	async (callback: (tx: ReturnType<typeof makeTx>) => unknown) =>
		callback(makeTx()),
);

mock.module("@superset/db/client", () => ({
	db: {},
	dbWs: { transaction: transactionMock },
}));

mock.module("@superset/db/utils", () => ({
	getCurrentTxid: mock(async () => 12345),
}));

mock.module("./utils/upload-chat-attachment", () => ({
	uploadChatAttachment: mock(async () => ({})),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { chatRouter } = await import("./chat");

const createCaller = createCallerFactory(
	createTRPCRouter({ chat: chatRouter } satisfies TRPCRouterRecord),
);

function createContext() {
	return {
		session: {
			user: { id: ACTOR_USER_ID, email: "actor@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

beforeEach(() => {
	existingCloudWorkspaces = new Set<string>();
	lastInsertValues = null;
	transactionMock.mockClear();
});

describe("chat.createSession — local-first workspaces (issue #5852)", () => {
	it("does not throw the raw FK error when the v2 workspace is not in cloud v2_workspaces", async () => {
		// Local-first: workspace exists in host.db but cloud table is empty.
		existingCloudWorkspaces = new Set<string>();

		const caller = createCaller(createContext());

		const result = await caller.chat.createSession({
			sessionId: SESSION_ID,
			v2WorkspaceId: LOCAL_ONLY_V2_WORKSPACE_ID,
		});

		expect(result.sessionId).toBe(SESSION_ID);
		// It must fall back to inserting a NULL v2_workspace_id rather than
		// letting the FK violation surface in the chat pane.
		expect(lastInsertValues?.v2WorkspaceId).toBeNull();
	});

	it("preserves the v2 workspace id when it does exist cloud-side", async () => {
		existingCloudWorkspaces = new Set<string>([CLOUD_V2_WORKSPACE_ID]);

		const caller = createCaller(createContext());

		const result = await caller.chat.createSession({
			sessionId: SESSION_ID,
			v2WorkspaceId: CLOUD_V2_WORKSPACE_ID,
		});

		expect(result.sessionId).toBe(SESSION_ID);
		expect(lastInsertValues?.v2WorkspaceId).toBe(CLOUD_V2_WORKSPACE_ID);
	});
});
