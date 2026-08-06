import { describe, expect, mock, test } from "bun:test";

mock.module("@superset/db/utils", () => ({
	getCurrentTxid: async () => 42,
}));

const { createChatSession } = await import("./create-chat-session");

const BASE_VALUES = {
	id: "11111111-1111-1111-1111-111111111111",
	organizationId: "22222222-2222-2222-2222-222222222222",
	createdBy: "33333333-3333-3333-3333-333333333333",
	v2WorkspaceId: "44444444-4444-4444-4444-444444444444",
};

function makeTx(behavior: { inserts: Array<Record<string, unknown> | Error> }) {
	const returned = behavior.inserts.map((insert) =>
		insert instanceof Error ? insert : [insert],
	);
	return {
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoNothing: () => ({
					returning: async () => {
						const next = returned.shift();
						if (next instanceof Error) throw next;
						return next;
					},
				}),
			}),
		}),
	};
}

function makeDb(behavior: { inserts: Array<Record<string, unknown> | Error> }) {
	const tx = makeTx(behavior);
	return {
		transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
			fn(tx),
	};
}

describe("createChatSession", () => {
	test("inserts with v2WorkspaceId on success", async () => {
		const db = makeDb({ inserts: [BASE_VALUES] });
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
	});

	test("retries without v2WorkspaceId on FK violation", async () => {
		const fkError = new Error(
			'insert or update on table "chat_sessions" violates foreign key constraint "chat_sessions_v2_workspace_id_v2_workspaces_id_fk"',
		);
		const retryValues = {
			id: BASE_VALUES.id,
			organizationId: BASE_VALUES.organizationId,
			createdBy: BASE_VALUES.createdBy,
		};
		const db = makeDb({ inserts: [fkError, retryValues] });
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
	});

	test("retries without v2WorkspaceId on generic foreign key error", async () => {
		const fkError = new Error('violates foreign key constraint "some_fk"');
		const retryValues = {
			id: BASE_VALUES.id,
			organizationId: BASE_VALUES.organizationId,
			createdBy: BASE_VALUES.createdBy,
		};
		const db = makeDb({ inserts: [fkError, retryValues] });
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
	});

	test("propagates non-FK errors", async () => {
		const otherError = new Error("connection refused");
		const db = makeDb({ inserts: [otherError] });
		await expect(createChatSession(db as never, BASE_VALUES)).rejects.toThrow(
			"connection refused",
		);
	});

	test("returns txid null when insert conflicts (onConflictDoNothing)", async () => {
		const db = makeDb({ inserts: [undefined] });
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: null });
	});

	test("logs and retries exactly once on FK violation", async () => {
		const warnMock = mock();
		const originalWarn = console.warn;
		console.warn = warnMock as never;
		try {
			const fkError = new Error(
				'violates foreign key constraint "chat_sessions_v2_workspace_id_v2_workspaces_id_fk"',
			);
			const retryValues = {
				id: BASE_VALUES.id,
				organizationId: BASE_VALUES.organizationId,
				createdBy: BASE_VALUES.createdBy,
			};
			const db = makeDb({ inserts: [fkError, retryValues] });
			const result = await createChatSession(db as never, BASE_VALUES);
			expect(result).toEqual({ txid: 42 });
			expect(warnMock).toHaveBeenCalledTimes(1);
			const [message, details] = warnMock.mock.calls[0];
			expect(message).toContain("without v2WorkspaceId");
			expect(details.sessionId).toBe(BASE_VALUES.id);
		} finally {
			console.warn = originalWarn;
		}
	});
});
