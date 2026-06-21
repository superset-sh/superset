#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

function loadRootEnv(): void {
	const envPath = resolve(process.cwd(), ".env");
	if (!existsSync(envPath)) return;

	for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const equalsIndex = line.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] ??= value
			.replaceAll("\\n", "\n")
			.replaceAll('\\"', '"')
			.replaceAll("\\$", "$")
			.replaceAll("\\\\", "\\");
	}
}

loadRootEnv();

const DEV_EMAIL = "admin@local.test";

export interface ParsedFixtureCommand {
	command: "seed" | "cleanup" | "help";
	options: Record<string, string | boolean>;
}

export function parseFixtureArgs(args: string[]): ParsedFixtureCommand {
	const [command = "help", ...rest] = args;
	if (command === "help" || command === "-h" || command === "--help") {
		return { command: "help", options: {} };
	}
	if (command !== "seed" && command !== "cleanup") {
		throw new Error(`unknown command: ${command}`);
	}

	const options: Record<string, string | boolean> = {};
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token?.startsWith("--")) {
			throw new Error(`unexpected argument: ${token ?? ""}`);
		}
		const key = token.slice(2);
		if (key === "allow-remote" || key === "allow-production") {
			options[key] = true;
			continue;
		}
		const value = rest[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`missing value for --${key}`);
		}
		options[key] = value;
		index += 1;
	}

	return { command, options };
}

export function assertSafeDatabaseUrl(
	databaseUrl: string | undefined,
	options: { allowRemote?: boolean } = {},
): string {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}
	if (options.allowRemote) {
		return databaseUrl;
	}

	const parsed = new URL(databaseUrl);
	const localHosts = new Set([
		"localhost",
		"127.0.0.1",
		"::1",
		"db.localtest.me",
	]);
	if (!localHosts.has(parsed.hostname)) {
		throw new Error(
			`Refusing to touch non-local DATABASE_URL host "${parsed.hostname}". Pass --allow-remote only for disposable non-production test data.`,
		);
	}

	return databaseUrl;
}

export function repoNameFromUrl(
	repoUrl: string | null | undefined,
): string | null {
	if (!repoUrl) return null;
	const withoutTrailingSlash = repoUrl.replace(/\/+$/, "");
	const lastSegment = basename(withoutTrailingSlash);
	if (!lastSegment) return null;
	const extension = extname(lastSegment);
	return extension === ".git"
		? lastSegment.slice(0, -extension.length)
		: lastSegment;
}

function safeDirectoryName(value: string): string {
	return value
		.trim()
		.replace(/\.git$/i, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function repoDirectoryCandidatesFromUrl(
	repoUrl: string | null | undefined,
): string[] {
	if (!repoUrl) return [];
	const repoName = repoNameFromUrl(repoUrl);
	const withoutTrailingSlash = repoUrl
		.replace(/\/+$/, "")
		.replace(/\.git$/i, "");
	const githubMatch = withoutTrailingSlash.match(
		/github\.com[:/]([^/:\s]+)[/:]([^/:\s]+)$/i,
	);
	const owner = githubMatch?.[1] ? safeDirectoryName(githubMatch[1]) : null;
	const name = githubMatch?.[2] ? safeDirectoryName(githubMatch[2]) : null;
	return [owner && name ? `${owner}-${name}` : null, repoName]
		.filter((value): value is string => Boolean(value))
		.filter(
			(value, index, values) =>
				value.length > 0 && values.indexOf(value) === index,
		);
}

export function cleanupCandidatesForProject(project: {
	id: string;
	slug: string;
	name: string;
	repoCloneUrl: string | null;
}): string[] {
	return [
		project.id,
		project.slug,
		project.name,
		...repoDirectoryCandidatesFromUrl(project.repoCloneUrl),
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.trim())
		.filter(
			(value, index, values) =>
				value.length > 0 && values.indexOf(value) === index,
		);
}

async function getDbDeps() {
	const [{ db }, schema, drizzle] = await Promise.all([
		import("../packages/db/src/client"),
		import("../packages/db/src/schema/index"),
		import("../packages/db/node_modules/drizzle-orm"),
	]);
	return {
		db,
		and: drizzle.and,
		eq: drizzle.eq,
		inArray: drizzle.inArray,
		or: drizzle.or,
		members: schema.members,
		users: schema.users,
		v2Projects: schema.v2Projects,
		v2Workspaces: schema.v2Workspaces,
	};
}

function stringOption(
	options: Record<string, string | boolean>,
	key: string,
): string | undefined {
	const value = options[key];
	return typeof value === "string" ? value : undefined;
}

async function resolveOrganizationId(email: string) {
	const { db, eq, members, users } = await getDbDeps();
	const [row] = await db
		.select({
			userId: users.id,
			organizationId: members.organizationId,
		})
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(users.email, email))
		.limit(1);

	if (!row) {
		throw new Error(
			`No organization found for ${email}. Run bun run db:seed-dev first.`,
		);
	}

	return row;
}

async function seedFixture(options: Record<string, string | boolean>) {
	assertSafeDatabaseUrl(process.env.DATABASE_URL, {
		allowRemote: Boolean(
			options["allow-remote"] || options["allow-production"],
		),
	});

	const slug = stringOption(options, "slug");
	const name = stringOption(options, "name") ?? slug;
	const repoCloneUrl =
		stringOption(options, "repo-url") ?? stringOption(options, "repo");
	const email = stringOption(options, "email") ?? DEV_EMAIL;
	const id = stringOption(options, "id");

	if (!slug) throw new Error("seed requires --slug");
	if (!name) throw new Error("seed requires --name or --slug");
	if (!repoCloneUrl) throw new Error("seed requires --repo-url");

	const { organizationId, userId } = await resolveOrganizationId(email);
	const { db, v2Projects } = await getDbDeps();
	const values: typeof v2Projects.$inferInsert = {
		organizationId,
		name,
		slug,
		repoCloneUrl,
	};
	if (id) {
		values.id = id;
	}

	const [project] = await db
		.insert(v2Projects)
		.values(values)
		.onConflictDoUpdate({
			target: [v2Projects.organizationId, v2Projects.slug],
			set: {
				name,
				repoCloneUrl,
				updatedAt: new Date(),
			},
		})
		.returning();

	if (!project) {
		throw new Error("Project fixture seed returned no row");
	}

	return {
		ok: true,
		action: "seed",
		email,
		userId,
		organizationId,
		project,
		cleanupCandidates: cleanupCandidatesForProject(project),
	};
}

async function cleanupFixture(options: Record<string, string | boolean>) {
	assertSafeDatabaseUrl(process.env.DATABASE_URL, {
		allowRemote: Boolean(
			options["allow-remote"] || options["allow-production"],
		),
	});

	const slug = stringOption(options, "slug");
	const id = stringOption(options, "id");
	const email = stringOption(options, "email") ?? DEV_EMAIL;
	if (!slug && !id) {
		throw new Error("cleanup requires --slug or --id");
	}

	const { organizationId, userId } = await resolveOrganizationId(email);
	const { and, db, eq, inArray, or, v2Projects, v2Workspaces } =
		await getDbDeps();
	const filters = [
		slug ? eq(v2Projects.slug, slug) : undefined,
		id ? eq(v2Projects.id, id) : undefined,
	].filter((filter) => Boolean(filter));
	const where = filters.length === 1 ? filters[0] : or(...filters);

	const projects = await db
		.select()
		.from(v2Projects)
		.where(and(eq(v2Projects.organizationId, organizationId), where))
		.limit(20);

	const projectIds = projects.map((project) => project.id);
	const workspaces =
		projectIds.length > 0
			? await db
					.select()
					.from(v2Workspaces)
					.where(inArray(v2Workspaces.projectId, projectIds))
			: [];

	if (projectIds.length > 0) {
		await db
			.delete(v2Workspaces)
			.where(inArray(v2Workspaces.projectId, projectIds));
		await db.delete(v2Projects).where(inArray(v2Projects.id, projectIds));
	}

	const cleanupCandidates = [
		...projects.flatMap(cleanupCandidatesForProject),
		...workspaces.flatMap((workspace) => [
			workspace.id,
			workspace.name,
			workspace.branch,
		]),
	].filter(
		(value, index, values): value is string =>
			typeof value === "string" &&
			value.trim().length > 0 &&
			values.indexOf(value) === index,
	);

	return {
		ok: true,
		action: "cleanup",
		email,
		userId,
		organizationId,
		deletedProjects: projects.length,
		deletedWorkspaces: workspaces.length,
		projects,
		workspaces,
		cleanupCandidates,
	};
}

function printHelp() {
	console.log(`Usage: bun run e2e:workspace-fixture -- <command> [options]

Commands:
  seed      Seed or update a v2 project fixture for the dev account organization
  cleanup   Delete fixture v2 project/workspace rows by slug or id
  help      Show this help

Seed options:
  --slug <slug>             Project slug
  --name <name>             Project display name
  --repo-url <url>          Git clone URL
  --id <uuid>               Optional deterministic project id
  --email <email>           Dev account email (default ${DEV_EMAIL})
  --allow-remote            Permit non-local DATABASE_URL for disposable test DBs

Cleanup options:
  --slug <slug>             Project slug
  --id <uuid>               Project id
  --email <email>           Dev account email (default ${DEV_EMAIL})
  --allow-remote            Permit non-local DATABASE_URL for disposable test DBs
`);
}

async function main() {
	const parsed = parseFixtureArgs(Bun.argv.slice(2));
	if (parsed.command === "help") {
		printHelp();
		return;
	}

	const result =
		parsed.command === "seed"
			? await seedFixture(parsed.options)
			: await cleanupFixture(parsed.options);
	console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
