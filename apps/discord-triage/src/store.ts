import { Database } from "bun:sqlite";
import { env } from "./env";

export type BridgeThread = {
	discordThreadId: string;
	discordUserId: string;
	subject: string;
	/** Message-ID of the first email we sent; every follow-up references it. */
	rootMessageId: string;
	/** Most recent Message-ID in the conversation, ours or Plain's. */
	lastMessageId: string;
};

const db = new Database(env.BRIDGE_DB_PATH ?? ":memory:", { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run(`CREATE TABLE IF NOT EXISTS threads (
	discord_thread_id TEXT PRIMARY KEY,
	discord_user_id TEXT NOT NULL,
	subject TEXT NOT NULL,
	root_message_id TEXT NOT NULL,
	last_message_id TEXT NOT NULL,
	created_at INTEGER NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS message_ids (
	message_id TEXT PRIMARY KEY,
	discord_thread_id TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS processed_inbound (
	email_id TEXT PRIMARY KEY,
	processed_at INTEGER NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
)`);

type Row = {
	discord_thread_id: string;
	discord_user_id: string;
	subject: string;
	root_message_id: string;
	last_message_id: string;
};

function toThread(row: Row): BridgeThread {
	return {
		discordThreadId: row.discord_thread_id,
		discordUserId: row.discord_user_id,
		subject: row.subject,
		rootMessageId: row.root_message_id,
		lastMessageId: row.last_message_id,
	};
}

export const store = {
	createThread(thread: BridgeThread) {
		db.run(`INSERT OR REPLACE INTO threads VALUES (?, ?, ?, ?, ?, ?)`, [
			thread.discordThreadId,
			thread.discordUserId,
			thread.subject,
			thread.rootMessageId,
			thread.lastMessageId,
			Date.now(),
		]);
		store.rememberMessageId(thread.rootMessageId, thread.discordThreadId);
	},

	getThread(discordThreadId: string): BridgeThread | undefined {
		const row = db
			.query<Row, [string]>(`SELECT * FROM threads WHERE discord_thread_id = ?`)
			.get(discordThreadId);
		return row ? toThread(row) : undefined;
	},

	findThreadByMessageIds(messageIds: string[]): BridgeThread | undefined {
		for (const id of messageIds) {
			const row = db
				.query<Row, [string]>(
					`SELECT t.* FROM message_ids m JOIN threads t ON t.discord_thread_id = m.discord_thread_id WHERE m.message_id = ?`,
				)
				.get(id);
			if (row) return toThread(row);
		}
		return undefined;
	},

	rememberMessageId(messageId: string, discordThreadId: string) {
		db.run(`INSERT OR IGNORE INTO message_ids VALUES (?, ?)`, [
			messageId,
			discordThreadId,
		]);
		db.run(
			`UPDATE threads SET last_message_id = ? WHERE discord_thread_id = ?`,
			[messageId, discordThreadId],
		);
	},

	/** Returns false when the inbound email was already handled (webhook retry). */
	markInboundProcessed(emailId: string): boolean {
		const res = db.run(
			`INSERT OR IGNORE INTO processed_inbound VALUES (?, ?)`,
			[emailId, Date.now()],
		);
		return res.changes === 1;
	},

	/** Failed delivery: release the id so the webhook retry gets to run it. */
	unmarkInboundProcessed(emailId: string) {
		db.run(`DELETE FROM processed_inbound WHERE email_id = ?`, [emailId]);
	},

	getSetting(key: string): string | undefined {
		return db
			.query<{ value: string }, [string]>(
				`SELECT value FROM settings WHERE key = ?`,
			)
			.get(key)?.value;
	},

	setSetting(key: string, value: string) {
		db.run(`INSERT OR REPLACE INTO settings VALUES (?, ?)`, [key, value]);
	},
};
