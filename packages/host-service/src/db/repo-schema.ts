type RepoDatabase = {
	exec(sql: string): unknown;
	prepare(sql: string): {
		all(...params: unknown[]): unknown[];
		run(...params: unknown[]): unknown;
	};
	transaction(callback: () => void): () => void;
};

function hostFromRow(row: { repo_provider: string; url: string }): string {
	try {
		const url = new URL(row.url);
		if (url.protocol === "https:" || url.protocol === "http:")
			return url.host.toLowerCase();
	} catch {}
	return row.repo_provider === "github" ? "github.com" : "";
}

function ensureIndex(
	sqlite: RepoDatabase,
	name: string,
	columns: string[],
	unique: boolean,
): void {
	const existing = sqlite
		.prepare("SELECT name FROM pragma_index_info(?)")
		.all(name) as { name: string }[];
	if (existing.map((column) => column.name).join(",") === columns.join(","))
		return;
	sqlite.exec(`DROP INDEX IF EXISTS ${name}`);
	sqlite.exec(
		`CREATE ${unique ? "UNIQUE " : ""}INDEX ${name} ON pull_requests (${columns.join(",")})`,
	);
}

// Fork additions follow upstream migrations without changing their journal.
export function applyRepoSchema(sqlite: RepoDatabase): void {
	sqlite.transaction(() => {
		const columns = sqlite
			.prepare("SELECT name FROM pragma_table_info('pull_requests')")
			.all() as { name: string }[];
		if (!columns.some((column) => column.name === "review_state_json"))
			sqlite.exec("ALTER TABLE pull_requests ADD review_state_json text");
		if (!columns.some((column) => column.name === "repo_host")) {
			sqlite.exec(
				"ALTER TABLE pull_requests ADD repo_host text NOT NULL DEFAULT 'github.com'",
			);
			const rows = sqlite
				.prepare("SELECT id, repo_provider, url FROM pull_requests")
				.all() as { id: string; repo_provider: string; url: string }[];
			const update = sqlite.prepare(
				"UPDATE pull_requests SET repo_host = ? WHERE id = ?",
			);
			for (const row of rows) update.run(hostFromRow(row), row.id);
		}
		const identity = ["repo_provider", "repo_host", "repo_owner", "repo_name"];
		ensureIndex(
			sqlite,
			"pull_requests_repo_pr_unique",
			[...identity, "pr_number"],
			true,
		);
		ensureIndex(
			sqlite,
			"pull_requests_repo_branch_idx",
			[...identity, "head_branch"],
			false,
		);
	})();
}
