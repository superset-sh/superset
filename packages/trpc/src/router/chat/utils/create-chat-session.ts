import { chatSessions } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { PgTransaction } from "drizzle-orm/pg-core";

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	try {
		return JSON.stringify(error) ?? String(error);
	} catch {
		return String(error);
	}
}

// Workspaces became host-owned/local-first (#5731): the main workspace is
// minted locally with a fresh UUID on every boot and is never mirrored to
// cloud `v2_workspaces`. The legacy `chat_sessions.v2_workspace_id` FK then
// rejects any insert for such a workspace. Mirrors the defensive retry in
// `apps/api/src/app/api/chat/[sessionId]/route.ts`.
//
// Match ONLY the specific constraint (or a v2_workspace_id FK violation) so
// unrelated errors — "column ... does not exist", generic "foreign key"
// mentions, network failures — never trigger a silent retry that would hide
// the real cause.
function shouldRetryWithoutV2WorkspaceId(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	if (message.includes("chat_sessions_v2_workspace_id_v2_workspaces_id_fk")) {
		return true;
	}
	return (
		message.includes("v2_workspace_id") &&
		message.includes("foreign key constraint")
	);
}

export interface ChatSessionInsert {
	id: string;
	organizationId: string;
	createdBy: string;
	v2WorkspaceId: string;
}

export interface ChatSessionCreateResult {
	txid: number | null;
}

// biome-ignore lint/suspicious/noExplicitAny: transaction type varies by client (Neon, PostgresJs, etc)
type ChatSessionTx = PgTransaction<any, any, any>;

type ChatSessionDb = {
	transaction: <T>(fn: (tx: ChatSessionTx) => Promise<T>) => Promise<T>;
};

async function insertAndGetTxid(
	tx: ChatSessionTx,
	values: Omit<ChatSessionInsert, "v2WorkspaceId"> | ChatSessionInsert,
) {
	const [inserted] = await tx
		.insert(chatSessions)
		.values(values)
		.onConflictDoNothing()
		.returning({ id: chatSessions.id });

	if (!inserted) {
		return { txid: null };
	}

	const txid = await getCurrentTxid(tx);
	return { txid };
}

/**
 * Insert a chat session, retrying without `v2WorkspaceId` when the legacy
 * foreign key rejects the insert. Local-first workspaces mint their own
 * host UUIDs that have no cloud `v2_workspaces` row, so the FK violation is
 * expected for those workspaces; the session still needs to exist so chat
 * can run against it. The retry runs in a fresh transaction: a failed insert
 * aborts the surrounding Postgres transaction, so re-inserting inside the
 * same one would fail regardless.
 */
export async function createChatSession(
	db: ChatSessionDb,
	values: ChatSessionInsert,
): Promise<ChatSessionCreateResult> {
	try {
		return await db.transaction((tx) => insertAndGetTxid(tx, values));
	} catch (error) {
		if (!shouldRetryWithoutV2WorkspaceId(error)) {
			throw error;
		}

		// Log a fixed retry reason only — never raw session/organization ids
		// or the raw DB error, which can carry user/workspace correlation data.
		console.warn(
			"[chat] retrying chat session insert without v2WorkspaceId (foreign-key constraint)",
		);

		return db.transaction((tx) =>
			insertAndGetTxid(tx, {
				id: values.id,
				organizationId: values.organizationId,
				createdBy: values.createdBy,
			}),
		);
	}
}
