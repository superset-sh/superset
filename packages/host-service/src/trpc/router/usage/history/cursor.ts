/**
 * Cursor CLI usage. cursor-agent keeps no token counts on disk (chat blobs
 * in `~/.cursor/chats/<md5(cwd)>/<conversationId>/store.db` hold messages
 * only), but the CLI's own bearer token authorizes Cursor's dashboard RPCs,
 * and `GetFilteredUsageEvents` returns per-request events with exact token
 * splits and the real cost in cents.
 *
 * The token comes from where the CLI stores it: the macOS keychain item
 * `cursor-access-token` / `cursor-user`, else an `auth.json` fallback
 * (`~/.cursor/auth.json`, `$XDG_CONFIG_HOME/cursor/auth.json`).
 *
 * Events carry no cwd — attribution goes through the local chats dir, whose
 * first path segment is md5(cwd): hash the caller's known workspace/project
 * paths and match. Unmatched conversations stay unattributed.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { type CursorUsageEvent, cursorEventsToEntries } from "./cursor-events";
import type { UsageLogEntry } from "./parse";

export { type CursorUsageEvent, cursorEventsToEntries } from "./cursor-events";

const execFileAsync = promisify(execFile);

const CURSOR_API_BASE = "https://api2.cursor.sh";
const PAGE_SIZE = 300;
// 90 days of heavy use fits well inside this; a runaway pagination must not.
const MAX_PAGES = 40;
const FETCH_TIMEOUT_MS = 15_000;
// Same rationale as the quota cache: don't re-hit an undocumented endpoint
// for every render poll. Keyed per cutoff so range switches stay fresh.
const EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_LABEL_DB_OPENS = 200;

export function cursorChatsDir(): string {
	return join(homedir(), ".cursor", "chats");
}

async function readAuthJsonToken(path: string): Promise<string | null> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf-8")) as {
			accessToken?: string;
			access_token?: string;
		};
		return parsed.accessToken ?? parsed.access_token ?? null;
	} catch {
		return null;
	}
}

/** The CLI's stored login, read the way cursor-agent itself stores it. */
export async function readCursorAccessToken(): Promise<string | null> {
	if (process.platform === "darwin") {
		try {
			const { stdout } = await execFileAsync("security", [
				"find-generic-password",
				"-s",
				"cursor-access-token",
				"-a",
				"cursor-user",
				"-w",
			]);
			const token = stdout.trim();
			if (token) return token;
		} catch {
			// No keychain item — fall through to the file fallbacks.
		}
	}
	const configHome =
		process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
	for (const path of [
		join(homedir(), ".cursor", "auth.json"),
		join(configHome, "cursor", "auth.json"),
	]) {
		const token = await readAuthJsonToken(path);
		if (token) return token;
	}
	return null;
}

async function fetchUsageEvents(
	token: string,
	cutoffMs: number,
): Promise<CursorUsageEvent[]> {
	const events: CursorUsageEvent[] = [];
	const endDate = Date.now();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const res = await fetch(
			`${CURSOR_API_BASE}/aiserver.v1.DashboardService/GetFilteredUsageEvents`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					teamId: 0,
					startDate: String(cutoffMs),
					endDate: String(endDate),
					page,
					pageSize: PAGE_SIZE,
				}),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			},
		);
		if (!res.ok) {
			throw new Error(`Cursor usage request failed (HTTP ${res.status})`);
		}
		const data = (await res.json()) as {
			totalUsageEventsCount?: number;
			usageEventsDisplay?: CursorUsageEvent[];
		};
		const pageEvents = data.usageEventsDisplay ?? [];
		events.push(...pageEvents);
		// A short page always ends the scan; the reported total only ends it
		// early when present — a missing count must not truncate to one page.
		if (pageEvents.length < PAGE_SIZE) break;
		const total = data.totalUsageEventsCount ?? 0;
		if (total > 0 && events.length >= total) break;
	}
	return events;
}

let cachedEvents: {
	cutoffMs: number;
	fetchedAt: number;
	events: CursorUsageEvent[];
} | null = null;

interface ChatDirIndex {
	/** conversationId → md5-of-cwd segment. */
	hashByConversation: Map<string, string>;
	/** conversationId → store.db path, for title lookup. */
	dbByConversation: Map<string, string>;
}

async function indexChatsDir(chatsDir: string): Promise<ChatDirIndex> {
	const hashByConversation = new Map<string, string>();
	const dbByConversation = new Map<string, string>();
	let hashes: string[] = [];
	try {
		const entries = await readdir(chatsDir, { withFileTypes: true });
		hashes = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return { hashByConversation, dbByConversation };
	}
	for (const hash of hashes) {
		let conversations: string[];
		try {
			const entries = await readdir(join(chatsDir, hash), {
				withFileTypes: true,
			});
			conversations = entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const conversation of conversations) {
			hashByConversation.set(conversation, hash);
			dbByConversation.set(
				conversation,
				join(chatsDir, hash, conversation, "store.db"),
			);
		}
	}
	return { hashByConversation, dbByConversation };
}

/** The chat's user-visible title from store.db's meta row (hex-coded JSON). */
function readChatTitle(dbPath: string): string | null {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(dbPath, { readonly: true, fileMustExist: true });
		const row = db.prepare("SELECT value FROM meta LIMIT 1").get() as
			| { value: string | Buffer }
			| undefined;
		if (!row) return null;
		let raw =
			typeof row.value === "string" ? row.value : row.value.toString("utf-8");
		if (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0) {
			raw = Buffer.from(raw, "hex").toString("utf-8");
		}
		const meta = JSON.parse(raw) as { name?: string };
		return typeof meta.name === "string" && meta.name ? meta.name : null;
	} catch {
		return null;
	} finally {
		db?.close();
	}
}

/**
 * Fetches and appends cursor entries. Network/auth failures are the caller's
 * to swallow — cursor must never take the local agents down with it.
 */
export async function collectCursorEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	cwdCandidates: readonly string[] = [],
	chatsDir: string = cursorChatsDir(),
): Promise<void> {
	const token = await readCursorAccessToken();
	if (!token) return;

	let events: CursorUsageEvent[];
	if (
		cachedEvents &&
		cachedEvents.cutoffMs === cutoffMs &&
		Date.now() - cachedEvents.fetchedAt < EVENTS_CACHE_TTL_MS
	) {
		events = cachedEvents.events;
	} else {
		events = await fetchUsageEvents(token, cutoffMs);
		cachedEvents = { cutoffMs, fetchedAt: Date.now(), events };
	}

	const entries = cursorEventsToEntries(events, cutoffMs);
	if (entries.length === 0) return;

	const { hashByConversation, dbByConversation } =
		await indexChatsDir(chatsDir);
	const cwdByHash = new Map<string, string>();
	for (const cwd of cwdCandidates) {
		cwdByHash.set(createHash("md5").update(cwd).digest("hex"), cwd);
	}

	let labelOpens = 0;
	const labeled = new Set<string>();
	for (const entry of entries) {
		const hash = hashByConversation.get(entry.sessionId);
		if (hash) {
			entry.cwd = cwdByHash.get(hash) ?? null;
		}
		if (
			sessionLabels &&
			!sessionLabels.has(entry.sessionId) &&
			!labeled.has(entry.sessionId) &&
			labelOpens < MAX_LABEL_DB_OPENS
		) {
			labeled.add(entry.sessionId);
			const dbPath = dbByConversation.get(entry.sessionId);
			if (dbPath) {
				labelOpens++;
				const title = readChatTitle(dbPath);
				if (title) sessionLabels.set(entry.sessionId, title);
			}
		}
		out.push(entry);
	}
}
