import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SUPERSET_HOME_DIR } from "../app-environment";

export interface CommandRecord {
	id: number;
	command: string;
	timestamp: number;
	workspaceId: string | null;
	cwd: string | null;
	exitCode: number | null;
}

export interface SearchResult {
	command: string;
	timestamp: number;
	workspaceId: string | null;
	cwd: string | null;
}

const COMMAND_HISTORY_DIR = join(SUPERSET_HOME_DIR, "command-history");
const DB_PATH = join(COMMAND_HISTORY_DIR, "index.db");

class CommandHistoryManager {
	private db: Database.Database | null = null;

	private getDb(): Database.Database {
		if (!this.db) {
			mkdirSync(COMMAND_HISTORY_DIR, { recursive: true });

			this.db = new Database(DB_PATH);
			this.db.pragma("journal_mode = WAL");

			// Create main commands table
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS commands (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					command TEXT NOT NULL,
					timestamp INTEGER NOT NULL,
					workspace_id TEXT,
					cwd TEXT,
					exit_code INTEGER
				)
			`);

			// Create FTS5 virtual table for fuzzy search
			this.db.exec(`
				CREATE VIRTUAL TABLE IF NOT EXISTS commands_fts USING fts5(
					command,
					content='commands',
					content_rowid='id'
				)
			`);

			// Create triggers to keep FTS in sync
			this.db.exec(`
				CREATE TRIGGER IF NOT EXISTS commands_ai AFTER INSERT ON commands BEGIN
					INSERT INTO commands_fts(rowid, command) VALUES (new.id, new.command);
				END
			`);

			this.db.exec(`
				CREATE TRIGGER IF NOT EXISTS commands_ad AFTER DELETE ON commands BEGIN
					INSERT INTO commands_fts(commands_fts, rowid, command) VALUES('delete', old.id, old.command);
				END
			`);

			this.db.exec(`
				CREATE TRIGGER IF NOT EXISTS commands_au AFTER UPDATE ON commands BEGIN
					INSERT INTO commands_fts(commands_fts, rowid, command) VALUES('delete', old.id, old.command);
					INSERT INTO commands_fts(rowid, command) VALUES (new.id, new.command);
				END
			`);

			// Create index for prefix matching (for ghost text)
			this.db.exec(`
				CREATE INDEX IF NOT EXISTS idx_commands_command ON commands(command)
			`);

			// Create index for timestamp ordering
			this.db.exec(`
				CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp DESC)
			`);

			console.log(`[command-history] Database initialized at: ${DB_PATH}`);
		}
		return this.db;
	}

	/**
	 * Record a command execution
	 */
	record(params: {
		command: string;
		workspaceId?: string;
		cwd?: string;
		exitCode?: number;
	}): void {
		const { command, workspaceId, cwd, exitCode } = params;

		// Skip empty commands or common noise
		const trimmed = command.trim();
		if (!trimmed || trimmed.length < 2) {
			return;
		}

		const db = this.getDb();
		const stmt = db.prepare(`
			INSERT INTO commands (command, timestamp, workspace_id, cwd, exit_code)
			VALUES (?, ?, ?, ?, ?)
		`);

		stmt.run(
			trimmed,
			Date.now(),
			workspaceId ?? null,
			cwd ?? null,
			exitCode ?? null,
		);
	}

	/**
	 * Search commands using FTS5 fuzzy matching
	 */
	search(params: {
		query: string;
		limit?: number;
		workspaceId?: string;
	}): SearchResult[] {
		const { query, limit = 50, workspaceId } = params;

		if (!query.trim()) {
			return this.getRecent({ limit, workspaceId });
		}

		const db = this.getDb();

		// Use FTS5 with prefix matching for better fuzzy search
		// Escape special FTS5 characters and add prefix matching
		const escapedQuery = query
			.replace(/['"]/g, "")
			.split(/\s+/)
			.filter((term) => term.length > 0)
			.map((term) => `"${term}"*`)
			.join(" ");

		if (!escapedQuery) {
			return this.getRecent({ limit, workspaceId });
		}

		let sql = `
			SELECT DISTINCT c.command, c.timestamp, c.workspace_id as workspaceId, c.cwd
			FROM commands c
			JOIN commands_fts fts ON c.id = fts.rowid
			WHERE commands_fts MATCH ?
		`;

		const sqlParams: (string | number)[] = [escapedQuery];

		if (workspaceId) {
			sql += ` AND c.workspace_id = ?`;
			sqlParams.push(workspaceId);
		}

		sql += ` ORDER BY c.timestamp DESC LIMIT ?`;
		sqlParams.push(limit);

		const stmt = db.prepare(sql);
		return stmt.all(...sqlParams) as SearchResult[];
	}

	/**
	 * Get the most recent command matching a prefix (for ghost text)
	 */
	getRecentMatch(params: {
		prefix: string;
		workspaceId?: string;
	}): string | null {
		const { prefix, workspaceId } = params;

		const trimmedPrefix = prefix.trim();
		if (!trimmedPrefix || trimmedPrefix.length < 2) {
			return null;
		}

		const db = this.getDb();

		let sql = `
			SELECT command
			FROM commands
			WHERE command LIKE ? || '%'
			AND command != ?
		`;

		const sqlParams: (string | number)[] = [trimmedPrefix, trimmedPrefix];

		if (workspaceId) {
			sql += ` AND workspace_id = ?`;
			sqlParams.push(workspaceId);
		}

		sql += ` ORDER BY timestamp DESC LIMIT 1`;

		const stmt = db.prepare(sql);
		const result = stmt.get(...sqlParams) as { command: string } | undefined;

		return result?.command ?? null;
	}

	/**
	 * Get most recent commands
	 */
	getRecent(params: { limit?: number; workspaceId?: string }): SearchResult[] {
		const { limit = 50, workspaceId } = params;

		const db = this.getDb();

		let sql = `
			SELECT DISTINCT command, MAX(timestamp) as timestamp, workspace_id as workspaceId, cwd
			FROM commands
		`;

		const sqlParams: (string | number)[] = [];

		if (workspaceId) {
			sql += ` WHERE workspace_id = ?`;
			sqlParams.push(workspaceId);
		}

		sql += ` GROUP BY command ORDER BY timestamp DESC LIMIT ?`;
		sqlParams.push(limit);

		const stmt = db.prepare(sql);
		return stmt.all(...sqlParams) as SearchResult[];
	}

	/**
	 * Close the database connection
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}

// Singleton instance
export const commandHistoryManager = new CommandHistoryManager();
