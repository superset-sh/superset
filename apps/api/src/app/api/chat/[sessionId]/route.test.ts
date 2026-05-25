import { beforeEach, describe, expect, it, mock } from "bun:test";

type ChatSessionRow = {
	id: string;
	createdBy: string;
	organizationId: string;
	workspaceId: string | null;
	title: string | null;
};

type Condition =
	| { type: "and"; conditions: Condition[] }
	| { type: "eq"; left: string; right: unknown }
	| { type: "isNull"; value: string };

const COLUMN_FIELD: Record<string, keyof ChatSessionRow> = {
	"chat_sessions.id": "id",
	"chat_sessions.created_by": "createdBy",
	"chat_sessions.organization_id": "organizationId",
	"chat_sessions.workspace_id": "workspaceId",
	"chat_sessions.title": "title",
};

function matchesCondition(row: ChatSessionRow, condition: Condition): boolean {
	switch (condition.type) {
		case "and":
			return condition.conditions.every((c) => matchesCondition(row, c));
		case "eq":
			return row[COLUMN_FIELD[condition.left]] === condition.right;
		case "isNull":
			return row[COLUMN_FIELD[condition.value]] == null;
	}
}

let store: ChatSessionRow[] = [];

const db = {
	update: () => ({
		set: (values: Partial<ChatSessionRow>) => ({
			where: (condition: Condition) => ({
				returning: async () => {
					const matched = store.filter((row) =>
						matchesCondition(row, condition),
					);
					for (const row of matched) Object.assign(row, values);
					return matched.map((row) => ({ id: row.id }));
				},
			}),
		}),
	}),
};

let currentSession: { user: { id: string } } | null = null;

mock.module("@superset/db/client", () => ({ db }));

mock.module("@superset/db/schema", () => ({
	chatSessions: {
		id: "chat_sessions.id",
		createdBy: "chat_sessions.created_by",
		organizationId: "chat_sessions.organization_id",
		workspaceId: "chat_sessions.workspace_id",
		title: "chat_sessions.title",
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: Condition[]) => ({ type: "and", conditions }),
	eq: (left: string, right: unknown) => ({ type: "eq", left, right }),
	isNull: (value: string) => ({ type: "isNull", value }),
}));

mock.module("../lib", () => ({
	requireAuth: async () => currentSession,
	getDurableStream: () => ({ create: async () => undefined }),
}));

const { PATCH } = await import("./route");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ATTACKER_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";

function patchTitle(title: string): Promise<Response> {
	const request = new Request(`http://localhost/api/chat/${SESSION_ID}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ title }),
	});
	return PATCH(request, { params: Promise.resolve({ sessionId: SESSION_ID }) });
}

describe("chat session PATCH authorization", () => {
	beforeEach(() => {
		store = [
			{
				id: SESSION_ID,
				createdBy: OWNER_ID,
				organizationId: ORGANIZATION_ID,
				workspaceId: null,
				title: "Original title",
			},
		];
		currentSession = null;
	});

	it("lets the owner rename their own chat session", async () => {
		currentSession = { user: { id: OWNER_ID } };

		const response = await patchTitle("Owner renamed");

		expect(response.status).toBe(200);
		expect(store[0].title).toBe("Owner renamed");
	});

	it("forbids a non-owner from renaming another user's chat session", async () => {
		currentSession = { user: { id: ATTACKER_ID } };

		const response = await patchTitle("Hijacked title");

		expect(response.status).toBe(404);
		expect(store[0].title).toBe("Original title");
	});

	it("rejects unauthenticated requests", async () => {
		currentSession = null;

		const response = await patchTitle("No auth");

		expect(response.status).toBe(401);
		expect(store[0].title).toBe("Original title");
	});
});
