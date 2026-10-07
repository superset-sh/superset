import { expect, mock, test } from "bun:test";
import type { WorkerTaskDefinition } from "../../workers/define-worker-task";

if (process.env.TEST_GITLAB_SELF_SEED_FIXTURE !== "1") {
	test("claimed GitLab self-seed isolated caller fixture", () => {
		const child = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				env: {
					PATH: process.env.PATH,
					TMPDIR: "/tmp",
					TEST_GITLAB_SELF_SEED_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		if (child.exitCode !== 0)
			throw new Error(Buffer.from(child.stderr).toString());
		expect(child.exitCode).toBe(0);
	});
} else {
	globalThis.fetch = mock(async () => {
		throw new Error("FIXTURE_NETWORK_DENIED");
	}) as unknown as typeof fetch;
	mock.module("../../trpc/router/agents/agents", () => ({
		runAgentInWorkspace: async () => {
			throw new Error("FIXTURE_AGENT_DENIED");
		},
	}));
	mock.module("../../trpc/router/attachments/attachments", () => ({
		importCloudAttachments: async () => {
			throw new Error("FIXTURE_ATTACHMENT_DENIED");
		},
	}));
	mock.module("../../trpc/router/settings/agent-configs", () => ({
		seedDefaultsIfEmpty: () => {
			throw new Error("FIXTURE_PRESET_DENIED");
		},
	}));
	mock.module("../setup/config", () => ({
		resolveScript: () => {
			throw new Error("FIXTURE_HOOK_DENIED");
		},
		shellSingleQuote: () => {
			throw new Error("FIXTURE_SHELL_DENIED");
		},
	}));
	const { Database } = await import("bun:sqlite");
	const { drizzle } = await import("drizzle-orm/bun-sqlite");
	const { runMigrations } = await import("@superset/shared/sqlite-migrations");
	const { resolve } = await import("node:path");
	const schema = await import("../../db/schema");
	const { applyRepoSchema } = await import("../../db/repo-schema");
	let liveRemote = "https://gitlab.example.test/Team/Sub/Repo.git";
	mock.module("../git/simple-git", () => ({
		createUserSimpleGit: () => ({
			revparse: async () => "/owned/workspace",
			raw: async () => `remote.origin.url ${liveRemote}\n`,
		}),
	}));
	const ownedWorkerPool = {
		async run<TInput, TResult>(
			definition: WorkerTaskDefinition<TInput, TResult>,
			input: TInput,
		) {
			if (definition.type !== "git/resolveRepository")
				throw new Error("FIXTURE_WORKER_TASK_DENIED");
			return definition.handler(input);
		},
	};
	const getOwnedWorkerPool = () => ownedWorkerPool;
	mock.module("../../workers/host-worker-pool", () => ({
		getHostWorkerPool: getOwnedWorkerPool,
	}));
	const { getHostWorkerPool } = await import("../../workers/host-worker-pool");
	if (getHostWorkerPool !== getOwnedWorkerPool)
		throw new Error("FIXTURE_WORKER_FACTORY_MISMATCH");
	const { resolveRepo } = await import(
		"../../trpc/router/workspace-creation/shared/project-helpers"
	);
	const {
		readSandboxIdentity,
		runSandboxSelfSeed,
		sandboxRepositoryWorkspaceId,
	} = await import("./sandbox-self-seed");
	type HostDb = import("../../db").HostDb;
	const workspaceId = "11111111-1111-4111-8111-111111111111";
	const repository = {
		provider: "gitlab" as const,
		url: "https://gitlab.example.test/Team/Sub/Repo.git",
		branch: "work/one",
		path: ".",
		hooks: true,
	};
	function identity(repositories = [repository]) {
		const value = readSandboxIdentity({
			SUPERSET_SANDBOX_WORKSPACE_ID: workspaceId,
			SUPERSET_SANDBOX_WORKSPACE_PATH: "/owned/workspace",
			SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify(repositories),
		});
		if (!value) throw new Error("FIXTURE_IDENTITY_MISSING");
		return value;
	}
	function fixture() {
		const sqlite = new Database(":memory:");
		const database = drizzle(sqlite, { schema });
		runMigrations(database, resolve(import.meta.dir, "../../../drizzle"));
		applyRepoSchema(sqlite);
		return { sqlite, db: database as unknown as HostDb };
	}
	function selected(sqlite: InstanceType<typeof Database>) {
		return sqlite
			.query(
				"SELECT p.* FROM projects p JOIN workspaces w ON w.project_id=p.id WHERE w.id=?",
			)
			.get(workspaceId) as Record<string, unknown>;
	}
	function legacy(sqlite: InstanceType<typeof Database>) {
		sqlite
			.query(
				"INSERT INTO projects (id, repo_path, name, created_at) VALUES ('owned-project', '/owned/workspace', 'Legacy', 1)",
			)
			.run();
		sqlite
			.query(
				"INSERT INTO workspaces (id,project_id,worktree_path,branch,name,type,created_at,updated_at) VALUES (?, 'owned-project','/owned/workspace','work/one','Legacy','local',1,1)",
			)
			.run(workspaceId);
	}
	function expectIdentity(row: Record<string, unknown>) {
		expect(row.repo_provider).toBe("gitlab");
		expect(row.repo_owner).toBe("Team/Sub");
		expect(row.repo_name).toBe("Repo");
		expect(row.repo_url).toBe("https://gitlab.example.test/Team/Sub/Repo");
		expect(row.remote_name).toBe("origin");
	}
	test("self-seed retains claimed provider through actual identity parsing", () => {
		expect(identity().repositories[0]).toEqual(repository);
	});
	test("new claimed cloud project has exact custom GitLab identity", () => {
		const { sqlite, db } = fixture();
		try {
			runSandboxSelfSeed(db, identity());
			expectIdentity(selected(sqlite));
		} finally {
			sqlite.close();
		}
	});
	test("actual host repository resolver uses claimed custom GitLab without version probe", async () => {
		const { sqlite, db } = fixture();
		try {
			runSandboxSelfSeed(db, identity());
			const fetchCount = (
				globalThis.fetch as unknown as ReturnType<typeof mock>
			).mock.calls.length;
			const result = await resolveRepo(
				{
					db,
					credentials: {
						getToken: async () => {
							throw new Error("FIXTURE_TOKEN_LOOKUP_DENIED");
						},
						getCredentials: async () => {
							throw new Error("FIXTURE_CREDENTIAL_LOOKUP_DENIED");
						},
						credentialRemedy: () => "FIXTURE_REMEDY",
					},
				},
				String(selected(sqlite).id),
			);
			expect(result.provider).toBe("gitlab");
			expect(result.host).toBe("gitlab.example.test");
			expect(result.owner).toBe("Team/Sub");
			expect(
				(globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls,
			).toHaveLength(fetchCount);
		} finally {
			sqlite.close();
		}
	});
	test("actual host repository resolver does not apply claimed hint to another instance", async () => {
		const { sqlite, db } = fixture();
		try {
			runSandboxSelfSeed(db, identity());
			liveRemote = "https://other.example.test/Team/Sub/Repo.git";
			const result = await resolveRepo(
				{
					db,
					credentials: {
						getToken: async () => {
							throw new Error("FIXTURE_TOKEN_LOOKUP_DENIED");
						},
						getCredentials: async () => {
							throw new Error("FIXTURE_CREDENTIAL_LOOKUP_DENIED");
						},
						credentialRemedy: () => "FIXTURE_REMEDY",
					},
				},
				String(selected(sqlite).id),
			);
			expect(result.provider).toBe("unknown");
			expect(result.host).toBe("other.example.test");
		} finally {
			liveRemote = repository.url;
			sqlite.close();
		}
	});
	test("claimed legacy scratch row gains missing identity without replacing workspace", () => {
		const { sqlite, db } = fixture();
		try {
			legacy(sqlite);
			runSandboxSelfSeed(db, identity());
			expectIdentity(selected(sqlite));
			expect(selected(sqlite).id).toBe("owned-project");
			expect(
				sqlite.query("SELECT name FROM workspaces WHERE id=?").get(workspaceId),
			).toEqual({ name: "Legacy" });
		} finally {
			sqlite.close();
		}
	});
	test("legacy clone URL and user metadata survive missing identity backfill", () => {
		const { sqlite, db } = fixture();
		try {
			legacy(sqlite);
			sqlite
				.query(
					"UPDATE projects SET repo_url=?,icon='OWNED_ICON',updated_at=11,naming_instructions='OWNED_INSTRUCTIONS'",
				)
				.run(repository.url);
			runSandboxSelfSeed(db, identity());
			const row = selected(sqlite);
			expect(row.repo_url).toBe(repository.url);
			expect(row.repo_provider).toBe("gitlab");
			expect(row.icon).toBe("OWNED_ICON");
			expect(row.updated_at).toBe(11);
			expect(row.naming_instructions).toBe("OWNED_INSTRUCTIONS");
		} finally {
			sqlite.close();
		}
	});
	test("legacy backfill never writes a pre-existing URL column", () => {
		const { sqlite, db } = fixture();
		try {
			legacy(sqlite);
			sqlite.query("UPDATE projects SET repo_url=?").run(repository.url);
			sqlite.exec(
				"CREATE TRIGGER reject_changed_url BEFORE UPDATE OF repo_url ON projects WHEN OLD.repo_url IS NOT NULL AND NEW.repo_url IS NOT OLD.repo_url BEGIN SELECT RAISE(ABORT,'OWNED_NONNULL_URL_WRITE'); END",
			);
			expect(() => runSandboxSelfSeed(db, identity())).not.toThrow();
			expect(selected(sqlite).repo_url).toBe(repository.url);
			expect(selected(sqlite).repo_owner).toBe("Team/Sub");
		} finally {
			sqlite.close();
		}
	});
	test("repeat claimed seed keeps exact existing project and workspace", () => {
		const { sqlite, db } = fixture();
		try {
			runSandboxSelfSeed(db, identity());
			const before = selected(sqlite);
			runSandboxSelfSeed(db, identity());
			expect(selected(sqlite)).toEqual(before);
			expect(sqlite.query("SELECT count(*) AS n FROM projects").get()).toEqual({
				n: 1,
			});
		} finally {
			sqlite.close();
		}
	});
	for (const mutation of [
		"UPDATE workspaces SET archived_at=1",
		"UPDATE workspaces SET worktree_path='/other/checkout'",
		"UPDATE projects SET deleted_at=1",
		"UPDATE projects SET repo_path='/other/checkout'",
		"UPDATE projects SET repo_provider='github'",
		"UPDATE projects SET repo_owner='Other'",
		"UPDATE projects SET repo_name='Other'",
		"UPDATE projects SET repo_url='https://other.example.test/Team/Sub/Repo'",
		"UPDATE projects SET repo_url='https://gitlab.example.test/Other/Repo'",
		"UPDATE projects SET remote_name='selected-other'",
	])
		test(`claimed legacy identity refuses conflict: ${mutation}`, () => {
			const { sqlite, db } = fixture();
			try {
				legacy(sqlite);
				sqlite.exec(mutation);
				const before = selected(sqlite);
				expect(() => runSandboxSelfSeed(db, identity())).toThrow();
				expect(selected(sqlite)).toEqual(before);
			} finally {
				sqlite.close();
			}
		});
	test("new claimed project and workspace commit atomically", () => {
		const { sqlite, db } = fixture();
		try {
			sqlite.exec(
				"CREATE TRIGGER fail_owned_workspace BEFORE INSERT ON workspaces BEGIN SELECT RAISE(ABORT,'FIXTURE_INSERT_DENIED'); END",
			);
			expect(() => runSandboxSelfSeed(db, identity())).toThrow(
				"FIXTURE_INSERT_DENIED",
			);
			expect(sqlite.query("SELECT count(*) AS n FROM projects").get()).toEqual({
				n: 0,
			});
		} finally {
			sqlite.close();
		}
	});
	test("claimed legacy backfill refuses a project shared with another workspace", () => {
		const { sqlite, db } = fixture();
		try {
			legacy(sqlite);
			sqlite
				.query(
					"INSERT INTO workspaces (id,project_id,worktree_path,branch,name,type,created_at,updated_at) VALUES ('other-workspace','owned-project','/other/checkout','other','Other','worktree',1,1)",
				)
				.run();
			const before = selected(sqlite);
			expect(() => runSandboxSelfSeed(db, identity())).toThrow();
			expect(selected(sqlite)).toEqual(before);
		} finally {
			sqlite.close();
		}
	});
	test("multiple claimed checkouts seed exact derived workspace associations", () => {
		const { sqlite, db } = fixture();
		try {
			runSandboxSelfSeed(
				db,
				identity([
					repository,
					{
						...repository,
						path: "secondary",
						url: "https://gitlab.example.test/Team/Sub/Other.git",
					},
				]),
			);
			const id = sandboxRepositoryWorkspaceId(workspaceId, "secondary");
			expect(
				sqlite
					.query(
						"SELECT p.repo_name,w.worktree_path FROM projects p JOIN workspaces w ON w.project_id=p.id WHERE w.id=?",
					)
					.get(id),
			).toEqual({
				repo_name: "Other",
				worktree_path: "/owned/workspace/secondary",
			});
		} finally {
			sqlite.close();
		}
	});
	test("GitHub self-seed records repository identity without an explicit provider", () => {
		const { sqlite, db } = fixture();
		try {
			const value = identity();
			value.repositories = [
				{
					url: "https://github.com/Team/Repo.git",
					path: ".",
					branch: "work/one",
				},
			];
			runSandboxSelfSeed(db, value);
			expect(selected(sqlite)).toMatchObject({
				repo_provider: "github",
				repo_owner: "Team",
				repo_name: "Repo",
				repo_url: "https://github.com/Team/Repo",
				remote_name: "origin",
			});
		} finally {
			sqlite.close();
		}
	});
	test("GitHub legacy self-seed backfills identity while preserving the workspace", () => {
		const { sqlite, db } = fixture();
		try {
			legacy(sqlite);
			const value = identity();
			value.repositories = [
				{
					url: "https://github.com/Team/Repo.git",
					path: ".",
					branch: "work/one",
				},
			];
			runSandboxSelfSeed(db, value);
			expect(selected(sqlite)).toMatchObject({
				id: "owned-project",
				repo_provider: "github",
				repo_owner: "Team",
				repo_name: "Repo",
				repo_url: "https://github.com/Team/Repo",
				remote_name: "origin",
			});
			expect(
				sqlite.query("SELECT name FROM workspaces WHERE id=?").get(workspaceId),
			).toEqual({ name: "Legacy" });
		} finally {
			sqlite.close();
		}
	});
	test("unrecognized unhinted repository retains null provider metadata", () => {
		const { sqlite, db } = fixture();
		try {
			const value = identity();
			value.repositories = [
				{
					url: "https://other.example.test/Team/Repo.git",
					path: ".",
					branch: "work/one",
				},
			];
			runSandboxSelfSeed(db, value);
			const row = selected(sqlite);
			for (const key of [
				"repo_provider",
				"repo_owner",
				"repo_name",
				"repo_url",
				"remote_name",
			])
				expect(row[key]).toBeNull();
		} finally {
			sqlite.close();
		}
	});
}
