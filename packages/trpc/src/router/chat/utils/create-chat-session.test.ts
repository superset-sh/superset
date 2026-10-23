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

const RETRY_VALUES = {
	id: BASE_VALUES.id,
	organizationId: BASE_VALUES.organizationId,
	createdBy: BASE_VALUES.createdBy,
};

type InsertOutcome = Record<string, unknown> | Error | undefined;

/**
 * Each `transaction()` call gets a FRESH transaction whose inserts are drawn
 * from the shared outcome queue — so the test can assert that the retry runs
 * in a new transaction (the original one is dead after Postgres aborts it)
 * rather than reusing the aborted transaction.
 */
function makeDb(inserts: InsertOutcome[]) {
	const outcomes = [...inserts];
	const txCalls: number[] = [];
	const capturedValues: Array<Record<string, unknown>> = [];
	let txCount = 0;

	const makeTx = () => {
		const txId = txCount++;
		return {
			insert: () => ({
				values: (values: Record<string, unknown>) => {
					capturedValues.push({ ...values });
					return {
						onConflictDoNothing: () => ({
							returning: async () => {
								const next = outcomes.shift();
								// A failed insert aborts the transaction — any
								// further insert on the SAME tx must fail too.
								if (next instanceof Error) {
									throw new Error(`${next.message} (tx ${txId} aborted)`);
								}
								return next === undefined ? [] : [next];
							},
						}),
					};
				},
			}),
		};
	};

	return {
		db: {
			transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
				txCalls.push(txCount);
				return fn(makeTx());
			},
		},
		txCalls,
		capturedValues,
	};
}

const FK_ERROR = new Error(
	'insert or update on table "chat_sessions" violates foreign key constraint "chat_sessions_v2_workspace_id_v2_workspaces_id_fk"',
);

describe("createChatSession", () => {
	test("inserts with v2WorkspaceId on success", async () => {
		const { db, txCalls, capturedValues } = makeDb([BASE_VALUES]);
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
		// one transaction, one insert, values passed through untouched
		expect(txCalls).toEqual([0]);
		expect(capturedValues).toEqual([BASE_VALUES]);
	});

	test("retries without v2WorkspaceId on FK violation", async () => {
		const { db, txCalls, capturedValues } = makeDb([FK_ERROR, RETRY_VALUES]);
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
		// retry runs in a SECOND transaction (the first aborted)
		expect(txCalls).toEqual([0, 1]);
		expect(capturedValues).toEqual([BASE_VALUES, RETRY_VALUES]);
	});

	test("retries without v2WorkspaceId on generic v2_workspace_id FK error", async () => {
		const fkError = new Error(
			'violates foreign key constraint "v2_workspace_id_fkey"',
		);
		const { db, txCalls, capturedValues } = makeDb([fkError, RETRY_VALUES]);
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: 42 });
		expect(txCalls).toEqual([0, 1]);
		expect(capturedValues).toEqual([BASE_VALUES, RETRY_VALUES]);
	});

	test("does NOT retry on unrelated FK errors", async () => {
		// A different FK constraint (not v2_workspace_id) must propagate.
		const otherFk = new Error(
			'violates foreign key constraint "chat_sessions_organization_id_fkey"',
		);
		const { db, txCalls, capturedValues } = makeDb([otherFk]);
		await expect(createChatSession(db as never, BASE_VALUES)).rejects.toThrow(
			"chat_sessions_organization_id_fkey",
		);
		expect(txCalls).toEqual([0]);
		expect(capturedValues).toEqual([BASE_VALUES]);
	});

	test("does NOT retry on unrelated column errors", async () => {
		// Generic errors mentioning "column" / "does not exist" must NOT
		// trigger the v2_workspace_id retry path.
		const colError = new Error('column "v2_workspace_id" does not exist');
		const { db, txCalls } = makeDb([colError]);
		await expect(createChatSession(db as never, BASE_VALUES)).rejects.toThrow(
			"does not exist",
		);
		expect(txCalls).toEqual([0]);
	});

	test("propagates non-FK errors", async () => {
		const otherError = new Error("connection refused");
		const { db, txCalls } = makeDb([otherError]);
		await expect(createChatSession(db as never, BASE_VALUES)).rejects.toThrow(
			"connection refused",
		);
		expect(txCalls).toEqual([0]);
	});

	test("returns txid null when insert conflicts (onConflictDoNothing)", async () => {
		const { db } = makeDb([undefined]);
		const result = await createChatSession(db as never, BASE_VALUES);
		expect(result).toEqual({ txid: null });
	});

	test("logs a fixed reason and retries exactly once on FK violation", async () => {
		const warnMock = mock();
		const originalWarn = console.warn;
		console.warn = warnMock as never;
		try {
			const { db } = makeDb([FK_ERROR, RETRY_VALUES]);
			const result = await createChatSession(db as never, BASE_VALUES);
			expect(result).toEqual({ txid: 42 });
			expect(warnMock).toHaveBeenCalledTimes(1);
			const [message] = warnMock.mock.calls[0] as [string];
			expect(message).toContain("without v2WorkspaceId");
			// The log must not leak raw session/organization ids (#6231 review).
			expect(message).not.toContain(BASE_VALUES.id);
			expect(message).not.toContain(BASE_VALUES.organizationId);
		} finally {
			console.warn = originalWarn;
		}
	});
});
