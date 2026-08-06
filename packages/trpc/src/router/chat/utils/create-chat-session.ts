import { chatSessions } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { PgTransaction } from "drizzle-orm/pg-core";

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

// Workspaces became host-owned/local-first (#5731): the main workspace is
// minted locally with a fresh UUID on every boot and is never mirrored to
// cloud `v2_workspaces`. The legacy `chat_sessions.v2_workspace_id` FK then
// rejects any insert for such a workspace. Mirrors the defensive retry in
// `apps/api/src/app/api/chat/[sessionId]/route.ts`.
function shouldRetryWithoutV2WorkspaceId(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	return (
		message.includes("v2_workspace_id") ||
		message.includes("chat_sessions_v2_workspace_id_v2_workspaces_id_fk") ||
		message.includes("foreign key") ||
		message.includes("column") ||
		message.includes("does not exist")
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

// biome-ignore lint/suspicious/noExplicitAny: only the transaction callback shape is needed
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

		console.warn("[chat] retrying chat session insert without v2WorkspaceId", {
			sessionId: values.id,
			organizationId: values.organizationId,
			v2WorkspaceId: values.v2WorkspaceId,
			error: errorMessage(error),
		});

		return db.transaction((tx) =>
			insertAndGetTxid(tx, {
				id: values.id,
				organizationId: values.organizationId,
				createdBy: values.createdBy,
			}),
		);
	}
}
