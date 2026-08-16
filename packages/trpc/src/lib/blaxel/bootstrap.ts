/**
 * Gets a provisioned sandbox from empty to serving a workspace: clone the
 * repo, seed the one project + one workspace row host-service expects, then
 * start it.
 *
 * host.db is seeded by writing rows directly rather than calling
 * host-service's own create procedures: those build worktrees off a base
 * repo, and a sandbox's checkout *is* the workspace, with nothing to branch
 * from yet.
 */
import { SandboxInstance } from "@blaxel/core";
import { SANDBOX_WORKSPACE_PATH as WORKSPACE_PATH } from "@superset/shared/constants";
import { TRPCError } from "@trpc/server";

const HOST_DB_PATH = "/data/host.db";
const HOST_SERVICE_PORT = 4879;

export interface BootstrapArgs {
	providerSandboxId: string;
	/**
	 * The cloud workspace's own id. The sandbox seeds its workspace row under
	 * it so the desktop can open `/v2-workspace/<id>` against the sandbox the
	 * same way it opens one against a host.
	 */
	workspaceId: string;
	repoCloneUrl: string;
	/** Short-lived GitHub App installation token; never persisted in the sandbox. */
	cloneToken: string | null;
	branch: string;
	organizationId: string;
	projectName: string;
	workspaceName: string;
	apiUrl: string;
	authToken: string;
}

function cloneUrlWithToken(repoCloneUrl: string, token: string | null): string {
	if (!token) return repoCloneUrl;
	return repoCloneUrl.replace(
		/^https:\/\//,
		`https://x-access-token:${token}@`,
	);
}

async function exec(
	sandbox: Awaited<ReturnType<typeof SandboxInstance.get>>,
	command: string,
	label: string,
): Promise<string> {
	const result = (await sandbox.process.exec({
		command,
		waitForCompletion: true,
	})) as unknown as { exitCode?: number; status?: number; logs?: string };
	const logs = (result.logs ?? "").toString();
	const code = result.exitCode ?? result.status;
	if (code !== 0) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Sandbox ${label} failed: ${logs.slice(-400)}`,
		});
	}
	return logs;
}

export async function bootstrapSandbox(args: BootstrapArgs): Promise<void> {
	const sandbox = await SandboxInstance.get(args.providerSandboxId);

	// The token is interpolated into a single command rather than written to
	// a credential file or env var, so it never outlives the clone.
	await exec(
		sandbox,
		`rm -rf ${WORKSPACE_PATH} && git clone --branch ${args.branch} --single-branch ${cloneUrlWithToken(args.repoCloneUrl, args.cloneToken)} ${WORKSPACE_PATH} 2>&1 | tail -3 || git clone ${cloneUrlWithToken(args.repoCloneUrl, args.cloneToken)} ${WORKSPACE_PATH} 2>&1 | tail -3`,
		"clone",
	);

	// host-service creates the schema on first boot, so it has to run once
	// before the seed has tables to write into.
	await exec(
		sandbox,
		`mkdir -p /data && cd /app && ORGANIZATION_ID=${args.organizationId} HOST_DB_PATH=${HOST_DB_PATH} HOST_MIGRATIONS_FOLDER=/app/drizzle AUTH_TOKEN=bootstrap SUPERSET_API_URL=${args.apiUrl} SUPERSET_HOST_RUN_MODE=sandbox timeout 25 node host-service.js > /data/migrate.log 2>&1; grep -q "Initialized at" /data/migrate.log`,
		"migrate",
	);

	// Written as a file rather than passed to `node -e`: the seed contains
	// quotes and newlines that a shell round-trip mangles.
	const seed = [
		'const Database = require("better-sqlite3");',
		`const db = new Database(${JSON.stringify(HOST_DB_PATH)});`,
		"const now = Date.now();",
		"const projectId = crypto.randomUUID();",
		`const workspaceId = ${JSON.stringify(args.workspaceId)};`,
		'db.prepare("INSERT INTO projects (id, repo_path, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")',
		`  .run(projectId, ${JSON.stringify(WORKSPACE_PATH)}, ${JSON.stringify(args.projectName)}, now, now);`,
		// type='main' because the checkout *is* the repo here — there is no base
		// repo it was branched from. It also keeps host-service's boot-time
		// main-workspace sweep from adding a second, phantom workspace to satisfy
		// its one-main-per-project index.
		'db.prepare("INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")',
		`  .run(workspaceId, projectId, ${JSON.stringify(WORKSPACE_PATH)}, ${JSON.stringify(args.branch)}, ${JSON.stringify(args.workspaceName)}, "main", now, now);`,
		"console.log(JSON.stringify({ projectId, workspaceId }));",
	].join("\n");
	await sandbox.fs.write("/app/seed.cjs", seed);
	await exec(sandbox, "mkdir -p /data && cd /app && node seed.cjs", "seed");

	const env = [
		`ORGANIZATION_ID=${args.organizationId}`,
		`HOST_DB_PATH=${HOST_DB_PATH}`,
		"HOST_MIGRATIONS_FOLDER=/app/drizzle",
		`AUTH_TOKEN=${args.authToken}`,
		`SUPERSET_API_URL=${args.apiUrl}`,
		"SUPERSET_HOST_RUN_MODE=sandbox",
		`PORT=${HOST_SERVICE_PORT}`,
	].join(" ");
	await exec(
		sandbox,
		`cd /app && ${env} nohup node host-service.js > /data/host-service.log 2>&1 & sleep 8; grep -q listening /data/host-service.log`,
		"start host-service",
	);
}
