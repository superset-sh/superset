/**
 * SQLite Schema for Session Durable Object
 *
 * Each session gets its own Durable Object with an embedded SQLite database
 * for persistent state management.
 */

/**
 * Initialize the SQLite schema for a session Durable Object.
 */
export function initSchema(sql: SqlStorage): void {
	sql.exec(`
		-- Session metadata
		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			repo_owner TEXT NOT NULL,
			repo_name TEXT NOT NULL,
			branch TEXT NOT NULL,
			base_branch TEXT NOT NULL DEFAULT 'main',
			status TEXT NOT NULL DEFAULT 'created',
			sandbox_status TEXT DEFAULT 'pending',
			model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
			sandbox_id TEXT,
			snapshot_id TEXT,
			pr_url TEXT,
			pr_number INTEGER,
			linear_issue_id TEXT,
			linear_issue_key TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			archived_at INTEGER
		);

		-- Participants (users connected to this session)
		CREATE TABLE IF NOT EXISTS participants (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			github_login TEXT,
			github_name TEXT,
			source TEXT NOT NULL DEFAULT 'web',
			joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			FOREIGN KEY (session_id) REFERENCES session(id)
		);

		-- Messages (prompts from users)
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			participant_id TEXT,
			content TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			status TEXT NOT NULL DEFAULT 'pending',
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			completed_at INTEGER,
			FOREIGN KEY (session_id) REFERENCES session(id),
			FOREIGN KEY (participant_id) REFERENCES participants(id)
		);

		-- Events (tool calls, tokens, errors from sandbox)
		CREATE TABLE IF NOT EXISTS events (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			message_id TEXT,
			type TEXT NOT NULL,
			data TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			FOREIGN KEY (session_id) REFERENCES session(id),
			FOREIGN KEY (message_id) REFERENCES messages(id)
		);

		-- Sandbox instances
		CREATE TABLE IF NOT EXISTS sandboxes (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			modal_object_id TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			snapshot_id TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			terminated_at INTEGER,
			FOREIGN KEY (session_id) REFERENCES session(id)
		);

		-- Indexes for efficient queries
		CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
		CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
		CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
		CREATE INDEX IF NOT EXISTS idx_events_message ON events(message_id);
		CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
		CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
		CREATE INDEX IF NOT EXISTS idx_sandboxes_session ON sandboxes(session_id);
	`);
}

/**
 * Generate a unique ID for database records.
 */
export function generateId(): string {
	return crypto.randomUUID();
}
