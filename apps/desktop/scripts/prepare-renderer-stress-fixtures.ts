#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, join, resolve } from "node:path";

interface Args {
	root: string;
	supersetHome: string;
	workspaceCount: number;
	changedFiles: number;
	linesPerFile: number;
	baseFiles: number;
	organizationId?: string;
	hostId?: string;
	json: boolean;
	help: boolean;
}

interface FixtureWorkspace {
	id: string;
	branch: string;
	worktreePath: string;
}

interface CollectionRow {
	key: string;
	value: string;
	row_version: number;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const envPath = resolve(repoRoot, ".env");
const fixtureSlug = "renderer-stress-large-diff";
const fixtureProjectName = "Renderer Stress Large Diff";

function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const text = readFileSync(path, "utf8");
	const values: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
		if (!match) continue;
		const [, key, rawValue] = match;
		values[key] = rawValue.trim().replace(/^["']|["']$/g, "");
	}
	return values;
}

const envFile = parseEnvFile(envPath);

function defaultSupersetHome(): string {
	return (
		envFile.SUPERSET_HOME_DIR ??
		process.env.SUPERSET_HOME_DIR ??
		resolve(repoRoot, "superset-dev-data")
	);
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		root: join(
			homedir(),
			"workplace",
			"playground",
			"superset-renderer-stress-fixtures",
		),
		supersetHome: defaultSupersetHome(),
		workspaceCount: 8,
		changedFiles: 220,
		linesPerFile: 80,
		baseFiles: 320,
		organizationId:
			envFile.SUPERSET_ORGANIZATION_ID ?? process.env.SUPERSET_ORGANIZATION_ID,
		hostId: undefined,
		json: false,
		help: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const readValue = () => {
			const value = argv[index + 1];
			if (!value) throw new Error(`Missing value for ${arg}`);
			index += 1;
			return value;
		};
		const readNumber = () => {
			const value = Number(readValue());
			if (!Number.isInteger(value) || value < 1) {
				throw new Error(`Invalid positive integer for ${arg}`);
			}
			return value;
		};

		switch (arg) {
			case "--help":
			case "-h":
				args.help = true;
				break;
			case "--root":
				args.root = resolve(readValue());
				break;
			case "--superset-home":
				args.supersetHome = resolve(readValue());
				break;
			case "--workspace-count":
				args.workspaceCount = readNumber();
				break;
			case "--changed-files":
				args.changedFiles = readNumber();
				break;
			case "--lines-per-file":
				args.linesPerFile = readNumber();
				break;
			case "--base-files":
				args.baseFiles = readNumber();
				break;
			case "--organization-id":
				args.organizationId = readValue();
				break;
			case "--host-id":
				args.hostId = readValue();
				break;
			case "--json":
				args.json = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return args;
}

function usage(): string {
	return `Prepare renderer stress fixture workspaces with large dirty git changes.

This seeds both the persisted V2 collections and the host-service SQLite DB.
Run it before starting the desktop dev app, or restart the app after running it.

Usage:
  bun --cwd apps/desktop stress:renderer:fixtures
  bun --cwd apps/desktop stress:renderer:fixtures -- --workspace-count 10 --changed-files 300

Options:
  --root <path>             Fixture root. Default: ~/workplace/playground/superset-renderer-stress-fixtures
  --superset-home <path>    Superset home dir. Default: SUPERSET_HOME_DIR, .env, or ./superset-dev-data
  --workspace-count <n>     Number of workspaces to create. Default: 8
  --changed-files <n>       Dirty changed files per workspace. Default: 220
  --lines-per-file <n>      Lines appended to each modified file. Default: 80
  --base-files <n>          Tracked files in the base repo. Default: 320
  --organization-id <id>    Organization id. Default: inferred from persisted collections
  --host-id <id>            Host machine id. Default: inferred from existing host DB rows
  --json                    Print machine-readable fixture metadata
`;
}

async function run(
	command: string,
	args: string[],
	options: { cwd?: string } = {},
): Promise<string> {
	const process = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with ${code}\n${stderr || stdout}`,
		);
	}
	return stdout.trim();
}

function quoteIdentifier(name: string): string {
	if (!/^[A-Za-z0-9_]+$/.test(name)) {
		throw new Error(`Unsafe SQLite identifier: ${name}`);
	}
	return `"${name}"`;
}

function getCollectionTable(db: Database, collectionId: string): string {
	const row = db
		.query("select table_name from collection_registry where collection_id = ?")
		.get(collectionId) as { table_name?: string } | null;
	if (!row?.table_name) {
		throw new Error(`Persisted collection not found: ${collectionId}`);
	}
	return row.table_name;
}

function inferOrganizationId(db: Database, explicit?: string): string {
	if (explicit) return explicit;
	const row = db
		.query(
			"select collection_id from collection_registry where collection_id like 'v2_workspaces-%' limit 1",
		)
		.get() as { collection_id?: string } | null;
	const prefix = "v2_workspaces-";
	if (!row?.collection_id?.startsWith(prefix)) {
		throw new Error(
			"Could not infer organization id from persisted collections",
		);
	}
	return row.collection_id.slice(prefix.length);
}

function getCollectionRows(db: Database, tableName: string): CollectionRow[] {
	return db
		.query(
			`select key, value, row_version from ${quoteIdentifier(tableName)} order by row_version`,
		)
		.all() as CollectionRow[];
}

function deleteCollectionKeys(
	db: Database,
	tableName: string,
	keys: string[],
): void {
	if (keys.length === 0) return;
	const statement = db.query(
		`delete from ${quoteIdentifier(tableName)} where key = ?`,
	);
	const remove = db.transaction((items: string[]) => {
		for (const key of items) statement.run(key);
	});
	remove(keys);
}

function getNextRowVersion(db: Database, collectionId: string): number {
	const fromVersion = db
		.query(
			"select latest_row_version from collection_version where collection_id = ?",
		)
		.get(collectionId) as { latest_row_version?: number } | null;
	return (fromVersion?.latest_row_version ?? 0) + 1;
}

function setCollectionVersion(
	db: Database,
	collectionId: string,
	latestRowVersion: number,
): void {
	db.query(
		`insert into collection_version (collection_id, latest_row_version)
		 values (?, ?)
		 on conflict(collection_id) do update set latest_row_version = excluded.latest_row_version`,
	).run(collectionId, latestRowVersion);
}

function insertCollectionValue(
	db: Database,
	tableName: string,
	key: string,
	value: unknown,
	metadata: unknown,
	rowVersion: number,
): void {
	db.query(
		`insert or replace into ${quoteIdentifier(
			tableName,
		)} (key, value, metadata, row_version) values (?, ?, ?, ?)`,
	).run(key, JSON.stringify(value), JSON.stringify(metadata), rowVersion);
}

function parseCollectionValue<T>(row: CollectionRow): T | null {
	try {
		return JSON.parse(row.value) as T;
	} catch {
		return null;
	}
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "renderer-stress"
	);
}

function collectionKeyExists(
	db: Database,
	tableName: string,
	key: string,
): boolean {
	const row = db
		.query(`select 1 as found from ${quoteIdentifier(tableName)} where key = ?`)
		.get(key) as { found?: number } | null;
	return Boolean(row?.found);
}

function ensureOrganizationRow({
	tanstackDb,
	organizationId,
	now,
}: {
	tanstackDb: Database;
	organizationId: string;
	now: string;
}): void {
	const organizationCollectionId = "organizations";
	const organizationTable = getCollectionTable(
		tanstackDb,
		organizationCollectionId,
	);
	const organizationKey = `s:${organizationId}`;
	if (collectionKeyExists(tanstackDb, organizationTable, organizationKey)) {
		return;
	}

	const rowVersion = getNextRowVersion(tanstackDb, organizationCollectionId);
	insertCollectionValue(
		tanstackDb,
		organizationTable,
		organizationKey,
		{
			allowedDomains: [],
			createdAt: now,
			id: organizationId,
			logo: null,
			metadata: null,
			name: `Renderer Stress ${organizationId}`,
			slug: slugify(organizationId),
			stripeCustomerId: null,
		},
		{ relation: ["auth", "organizations"], operation: "insert" },
		rowVersion,
	);
	setCollectionVersion(tanstackDb, organizationCollectionId, rowVersion);
}

function ensureHostRow({
	tanstackDb,
	hostCollectionId,
	hostTable,
	organizationId,
	hostId,
	now,
}: {
	tanstackDb: Database;
	hostCollectionId: string;
	hostTable: string;
	organizationId: string;
	hostId: string;
	now: string;
}): void {
	const hostKey = `s:${hostId}`;
	if (collectionKeyExists(tanstackDb, hostTable, hostKey)) {
		return;
	}

	const rowVersion = getNextRowVersion(tanstackDb, hostCollectionId);
	insertCollectionValue(
		tanstackDb,
		hostTable,
		hostKey,
		{
			createdAt: now,
			createdByUserId: null,
			isOnline: true,
			machineId: hostId,
			name: hostname() || "Renderer Stress Host",
			organizationId,
			updatedAt: now,
		},
		{ relation: ["public", "v2_hosts"], operation: "insert" },
		rowVersion,
	);
	setCollectionVersion(tanstackDb, hostCollectionId, rowVersion);
}

function inferHostId({
	explicit,
	tanstackDb,
	hostDb,
	workspaceTable,
	hostTable,
}: {
	explicit?: string;
	tanstackDb: Database;
	hostDb: Database;
	workspaceTable: string;
	hostTable: string;
}): string {
	if (explicit) return explicit;

	const hostWorkspaceIds = new Set(
		(
			hostDb.query("select id from workspaces").all() as Array<{ id: string }>
		).map((row) => row.id),
	);

	for (const row of getCollectionRows(tanstackDb, workspaceTable)) {
		const workspace = parseCollectionValue<{ id: string; hostId?: string }>(
			row,
		);
		if (
			workspace?.id &&
			hostWorkspaceIds.has(workspace.id) &&
			workspace.hostId
		) {
			return workspace.hostId;
		}
	}

	for (const row of getCollectionRows(tanstackDb, hostTable)) {
		const host = parseCollectionValue<{
			machineId?: string;
			isOnline?: boolean;
		}>(row);
		if (host?.machineId && host.isOnline !== false) {
			return host.machineId;
		}
	}

	throw new Error("Could not infer host id; pass --host-id");
}

async function writeBaseRepo({
	repoPath,
	baseFiles,
	linesPerFile,
}: {
	repoPath: string;
	baseFiles: number;
	linesPerFile: number;
}): Promise<void> {
	await mkdir(repoPath, { recursive: true });
	await run("git", ["init", "-b", "main"], { cwd: repoPath });
	await run("git", ["config", "user.name", "Renderer Stress"], {
		cwd: repoPath,
	});
	await run(
		"git",
		["config", "user.email", "renderer-stress@example.invalid"],
		{
			cwd: repoPath,
		},
	);

	for (let index = 0; index < baseFiles; index += 1) {
		const moduleId = String(index % 20).padStart(2, "0");
		const fileId = String(index).padStart(3, "0");
		const dir = join(repoPath, "src", `module-${moduleId}`);
		await mkdir(dir, { recursive: true });
		const body = Array.from(
			{ length: Math.max(8, Math.floor(linesPerFile / 2)) },
			(_, line) => `export const value${line} = ${index + line};`,
		).join("\n");
		await writeFile(join(dir, `file-${fileId}.ts`), `${body}\n`);
	}

	await writeFile(
		join(repoPath, "README.md"),
		`# Renderer Stress Fixture\n\nGenerated for large-diff renderer stress tests.\n`,
	);
	await run("git", ["add", "."], { cwd: repoPath });
	await run("git", ["commit", "-m", "seed renderer stress fixture"], {
		cwd: repoPath,
	});
}

async function mutateWorktree({
	worktreePath,
	workspaceIndex,
	changedFiles,
	linesPerFile,
	baseFiles,
}: {
	worktreePath: string;
	workspaceIndex: number;
	changedFiles: number;
	linesPerFile: number;
	baseFiles: number;
}): Promise<void> {
	for (let index = 0; index < changedFiles; index += 1) {
		const fileIndex = (workspaceIndex * 37 + index) % baseFiles;
		const moduleId = String(fileIndex % 20).padStart(2, "0");
		const fileId = String(fileIndex).padStart(3, "0");
		const filePath = join(
			worktreePath,
			"src",
			`module-${moduleId}`,
			`file-${fileId}.ts`,
		);
		const body = Array.from(
			{ length: linesPerFile },
			(_, line) =>
				`export const stress${workspaceIndex}_${index}_${line} = ${workspaceIndex + index + line};`,
		).join("\n");
		await writeFile(filePath, `${body}\n`, { flag: "a" });
	}

	for (
		let index = 0;
		index < Math.max(12, Math.floor(changedFiles / 8));
		index += 1
	) {
		const fileIndex = (workspaceIndex * 11 + index) % baseFiles;
		const moduleId = String(fileIndex % 20).padStart(2, "0");
		const fileId = String(fileIndex).padStart(3, "0");
		await rm(
			join(worktreePath, "src", `module-${moduleId}`, `file-${fileId}.ts`),
			{
				force: true,
			},
		);
	}

	for (
		let index = 0;
		index < Math.max(16, Math.floor(changedFiles / 6));
		index += 1
	) {
		const dir = join(worktreePath, "generated", `workspace-${workspaceIndex}`);
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, `new-file-${String(index).padStart(3, "0")}.ts`),
			`export const generated = ${workspaceIndex * 1000 + index};\n`.repeat(
				Math.max(12, Math.floor(linesPerFile / 2)),
			),
		);
	}

	for (
		let index = 0;
		index < Math.max(4, Math.floor(changedFiles / 50));
		index += 1
	) {
		const fileIndex = (workspaceIndex * 17 + index + 40) % baseFiles;
		const moduleId = String(fileIndex % 20).padStart(2, "0");
		const fileId = String(fileIndex).padStart(3, "0");
		const oldPath = join("src", `module-${moduleId}`, `file-${fileId}.ts`);
		const newDir = join("renamed", `workspace-${workspaceIndex}`);
		await mkdir(join(worktreePath, newDir), { recursive: true });
		await run("git", ["mv", oldPath, join(newDir, `renamed-${fileId}.ts`)], {
			cwd: worktreePath,
		}).catch(() => undefined);
	}

	await writeFile(
		join(worktreePath, `large-single-file-${workspaceIndex}.txt`),
		Array.from(
			{ length: linesPerFile * 20 },
			(_, line) => `workspace ${workspaceIndex} large line ${line}`,
		).join("\n"),
	);

	await run("git", ["add", "src", "renamed"], { cwd: worktreePath }).catch(
		() => undefined,
	);
}

async function createGitFixtures(args: Args): Promise<{
	projectId: string;
	repoPath: string;
	workspaces: FixtureWorkspace[];
}> {
	const repoPath = join(args.root, "large-diff-repo");
	const worktreesRoot = join(args.root, "worktrees");

	await rm(repoPath, { recursive: true, force: true });
	await rm(worktreesRoot, { recursive: true, force: true });
	await mkdir(worktreesRoot, { recursive: true });
	await writeBaseRepo({
		repoPath,
		baseFiles: Math.max(args.baseFiles, args.changedFiles + 40),
		linesPerFile: args.linesPerFile,
	});

	const workspaces: FixtureWorkspace[] = [];
	for (let index = 0; index < args.workspaceCount; index += 1) {
		const branch = `renderer-stress/large-${String(index + 1).padStart(2, "0")}`;
		const worktreePath = join(
			worktreesRoot,
			`large-${String(index + 1).padStart(2, "0")}`,
		);
		await run("git", ["worktree", "add", "-b", branch, worktreePath, "main"], {
			cwd: repoPath,
		});
		await mutateWorktree({
			worktreePath,
			workspaceIndex: index,
			changedFiles: args.changedFiles,
			linesPerFile: args.linesPerFile,
			baseFiles: Math.max(args.baseFiles, args.changedFiles + 40),
		});
		workspaces.push({
			id: randomUUID(),
			branch,
			worktreePath,
		});
	}

	return {
		projectId: randomUUID(),
		repoPath,
		workspaces,
	};
}

function removePreviousFixtureRows({
	tanstackDb,
	hostDb,
	projectTable,
	workspaceTable,
	repoPath,
}: {
	tanstackDb: Database;
	hostDb: Database;
	projectTable: string;
	workspaceTable: string;
	repoPath: string;
}): void {
	const oldProjectIds = new Set<string>();
	const projectKeysToDelete: string[] = [];
	for (const row of getCollectionRows(tanstackDb, projectTable)) {
		const project = parseCollectionValue<{
			id: string;
			slug?: string;
			repoCloneUrl?: string | null;
		}>(row);
		if (
			project?.id &&
			(project.slug === fixtureSlug ||
				project.repoCloneUrl === `file://${repoPath}`)
		) {
			oldProjectIds.add(project.id);
			projectKeysToDelete.push(row.key);
		}
	}

	const workspaceKeysToDelete: string[] = [];
	for (const row of getCollectionRows(tanstackDb, workspaceTable)) {
		const workspace = parseCollectionValue<{
			projectId?: string;
			branch?: string;
		}>(row);
		if (
			workspace?.projectId &&
			(oldProjectIds.has(workspace.projectId) ||
				workspace.branch?.startsWith("renderer-stress/large-"))
		) {
			workspaceKeysToDelete.push(row.key);
		}
	}

	deleteCollectionKeys(tanstackDb, workspaceTable, workspaceKeysToDelete);
	deleteCollectionKeys(tanstackDb, projectTable, projectKeysToDelete);

	const hostProjectRows = hostDb
		.query("select id from projects where repo_path = ?")
		.all(repoPath) as Array<{ id: string }>;
	for (const row of hostProjectRows) {
		hostDb.query("delete from workspaces where project_id = ?").run(row.id);
		hostDb.query("delete from projects where id = ?").run(row.id);
	}
}

async function seedDatabases({
	args,
	projectId,
	repoPath,
	workspaces,
}: {
	args: Args;
	projectId: string;
	repoPath: string;
	workspaces: FixtureWorkspace[];
}): Promise<{ organizationId: string; hostId: string }> {
	const tanstackPath = join(args.supersetHome, "tanstack-db.sqlite");
	if (!existsSync(tanstackPath)) {
		throw new Error(`TanStack DB not found: ${tanstackPath}`);
	}

	const tanstackDb = new Database(tanstackPath);
	const organizationId = inferOrganizationId(tanstackDb, args.organizationId);
	const hostDbPath = join(args.supersetHome, "host", organizationId, "host.db");
	if (!existsSync(hostDbPath)) {
		throw new Error(`Host DB not found: ${hostDbPath}`);
	}

	const hostDb = new Database(hostDbPath);
	const projectCollectionId = `v2_projects-${organizationId}`;
	const workspaceCollectionId = `v2_workspaces-${organizationId}`;
	const hostCollectionId = `v2_hosts-${organizationId}`;
	const projectTable = getCollectionTable(tanstackDb, projectCollectionId);
	const workspaceTable = getCollectionTable(tanstackDb, workspaceCollectionId);
	const hostTable = getCollectionTable(tanstackDb, hostCollectionId);
	const hostId = inferHostId({
		explicit: args.hostId,
		tanstackDb,
		hostDb,
		workspaceTable,
		hostTable,
	});

	const now = new Date().toISOString();
	ensureOrganizationRow({ tanstackDb, organizationId, now });
	ensureHostRow({
		tanstackDb,
		hostCollectionId,
		hostTable,
		organizationId,
		hostId,
		now,
	});

	removePreviousFixtureRows({
		tanstackDb,
		hostDb,
		projectTable,
		workspaceTable,
		repoPath,
	});

	const projectVersion = getNextRowVersion(tanstackDb, projectCollectionId);
	let workspaceVersion = getNextRowVersion(tanstackDb, workspaceCollectionId);

	insertCollectionValue(
		tanstackDb,
		projectTable,
		`s:${projectId}`,
		{
			createdAt: now,
			githubRepositoryId: null,
			iconUrl: null,
			id: projectId,
			name: fixtureProjectName,
			organizationId,
			repoCloneUrl: `file://${repoPath}`,
			slug: fixtureSlug,
			updatedAt: now,
		},
		{ relation: ["public", "v2_projects"], operation: "insert" },
		projectVersion,
	);

	hostDb
		.query(
			`insert into projects
			 (id, repo_path, repo_provider, repo_owner, repo_name, repo_url, remote_name, created_at)
			 values (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			projectId,
			repoPath,
			"local",
			null,
			basename(repoPath),
			null,
			null,
			Date.now(),
		);

	for (const workspace of workspaces) {
		const headSha = await run("git", ["rev-parse", "HEAD"], {
			cwd: workspace.worktreePath,
		});
		hostDb
			.query(
				`insert into workspaces
				 (id, project_id, worktree_path, branch, head_sha, created_at)
				 values (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				workspace.id,
				projectId,
				workspace.worktreePath,
				workspace.branch,
				headSha,
				Date.now(),
			);

		insertCollectionValue(
			tanstackDb,
			workspaceTable,
			`s:${workspace.id}`,
			{
				branch: workspace.branch,
				createdAt: now,
				createdByUserId: null,
				hostId,
				id: workspace.id,
				name: `large diff ${workspace.branch.split("/").at(-1)}`,
				organizationId,
				projectId,
				taskId: null,
				type: "worktree",
				updatedAt: now,
			},
			{ relation: ["public", "v2_workspaces"], operation: "insert" },
			workspaceVersion,
		);
		workspaceVersion += 1;
	}

	setCollectionVersion(tanstackDb, projectCollectionId, projectVersion);
	setCollectionVersion(tanstackDb, workspaceCollectionId, workspaceVersion - 1);

	tanstackDb.close();
	hostDb.close();
	return { organizationId, hostId };
}

async function main(): Promise<void> {
	const args = parseArgs(Bun.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}

	const { projectId, repoPath, workspaces } = await createGitFixtures(args);
	const { organizationId, hostId } = await seedDatabases({
		args,
		projectId,
		repoPath,
		workspaces,
	});

	const result = {
		organizationId,
		hostId,
		projectId,
		repoPath,
		workspaceIds: workspaces.map((workspace) => workspace.id),
		workspaceCount: workspaces.length,
		changedFilesPerWorkspace: args.changedFiles,
		fixtureRoot: args.root,
		stressCommand: `bun --cwd apps/desktop stress:renderer -- --scenario all --workspace-ids ${workspaces
			.map((workspace) => workspace.id)
			.join(
				",",
			)} --iterations 1000 --route-iterations 240 --heavy-iterations 500 --timeout-ms 300000`,
	};

	if (args.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log("[stress:fixtures] prepared large-diff renderer fixtures");
	console.log(`  org: ${organizationId}`);
	console.log(`  host: ${hostId}`);
	console.log(`  project: ${projectId}`);
	console.log(`  repo: ${repoPath}`);
	console.log(`  workspaces: ${workspaces.length}`);
	console.log(`  workspace ids: ${result.workspaceIds.join(",")}`);
	console.log(
		"  restart the desktop dev app before running stress if it was open",
	);
	console.log(`  ${result.stressCommand}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	console.error("");
	console.error(usage());
	process.exit(1);
});
