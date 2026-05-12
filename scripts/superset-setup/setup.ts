import {
	chmod,
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { get as httpGet } from "node:http";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
	captureCommand,
	commandExists,
	printCapturedFailure,
	runCommand,
} from "./command.ts";
import { isNodeErrorWithCode, parseEnvFile, upsertEnvVar } from "./env-file.ts";
import { SetupReporter } from "./log.ts";

interface SetupOptions {
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	scriptDir: string;
}

interface SetupState {
	args: ParsedArgs;
	cwd: string;
	env: NodeJS.ProcessEnv;
	homeDir: string;
	reporter: SetupReporter;
	scriptDir: string;
	rootPath?: string;
	workspaceName?: string;
	branchId?: string;
	directUrl?: string;
	pooledUrl?: string;
	portBase?: number;
	ports?: WorkspacePorts;
	electricContainer?: string;
	electricPort?: number;
	electricUrl?: string;
	electricSecret?: string;
}

interface ParsedArgs {
	forceOverwriteData: boolean;
	setupLocalMcp: boolean;
}

interface WorkspacePorts {
	base: number;
	web: number;
	api: number;
	marketing: number;
	admin: number;
	docs: number;
	desktopVite: number;
	desktopNotifications: number;
	streams: number;
	streamsInternal: number;
	electric: number;
	caddyElectric: number;
	codeInspector: number;
	desktopAutomation: number;
	wrangler: number;
	relay: number;
}

interface NeonBranch {
	id: string;
	name: string;
}

const ELECTRIC_IMAGE = "electricsql/electric:1.4.13";
const DEFAULT_ELECTRIC_SECRET = "local_electric_dev_secret";

export async function runSetup(options: SetupOptions): Promise<boolean> {
	const parsed = parseArgs(options.args);
	if (parsed.kind === "help") {
		printUsage();
		return true;
	}
	if (parsed.kind === "error") {
		console.error(`Unknown argument: ${parsed.argument}`);
		printUsage();
		return false;
	}

	const reporter = new SetupReporter();
	const state: SetupState = {
		args: parsed.args,
		cwd: options.cwd,
		env: options.env,
		homeDir: homedir(),
		reporter,
		scriptDir: options.scriptDir,
	};

	console.log("Setting up Superset workspace...");
	console.log("");

	await runStep(state, "Load environment variables", () => stepLoadEnv(state));
	await runStep(state, "Check dependencies", () =>
		stepCheckDependencies(state),
	);
	await runStep(state, "Install dependencies", () =>
		stepInstallDependencies(state),
	);
	await runStep(state, "Seed local DB", () => stepSeedLocalDb(state));
	await runStep(state, "Seed host-service DBs", () => stepSeedHostDbs(state));
	await runStep(state, "Seed auth token", () => stepSeedAuthToken(state));
	await runStep(state, "Setup Neon branch", () => stepSetupNeonBranch(state));
	await runStep(state, "Allocate port base", () => stepAllocatePortBase(state));
	await runStep(state, "Start Electric SQL", () => stepStartElectric(state));
	await runStep(state, "Write .env file", () => stepWriteEnv(state));

	if (state.args.setupLocalMcp) {
		await runStep(state, "Setup local MCP", () => stepSetupLocalMcp(state));
	}

	return reporter.printSummary("Setup");
}

type ParseResult =
	| { kind: "ok"; args: ParsedArgs }
	| { kind: "help" }
	| { kind: "error"; argument: string };

function parseArgs(args: string[]): ParseResult {
	const parsed: ParsedArgs = {
		forceOverwriteData: false,
		setupLocalMcp: false,
	};

	for (const arg of args) {
		switch (arg) {
			case "-f":
			case "--force":
				parsed.forceOverwriteData = true;
				break;
			case "-m":
			case "--mcp":
				parsed.setupLocalMcp = true;
				break;
			case "-h":
			case "--help":
				return { kind: "help" };
			default:
				return { kind: "error", argument: arg };
		}
	}

	return { kind: "ok", args: parsed };
}

function printUsage(): void {
	console.log(`Usage: .superset/setup.sh --ts [options]

Options:
  -f, --force              Reset superset-dev-data/ before seeding local DB
  -m, --mcp                Add superset-local MCP entry to .mcp.json
  -h, --help               Show this help message`);
}

async function runStep(
	state: SetupState,
	name: string,
	step: () => Promise<boolean> | boolean,
): Promise<void> {
	try {
		const ok = await step();
		if (!ok) {
			state.reporter.stepFailed(name);
		}
	} catch (error) {
		state.reporter.error(errorToMessage(error));
		state.reporter.stepFailed(name);
	}
}

async function stepLoadEnv(state: SetupState): Promise<boolean> {
	console.log("Loading environment variables...");

	const rootPath = state.env.SUPERSET_ROOT_PATH;
	if (!rootPath) {
		state.reporter.error("SUPERSET_ROOT_PATH not set");
		return false;
	}

	const rootEnvPath = join(rootPath, ".env");
	if (!(await isFile(rootEnvPath))) {
		state.reporter.error(`Root .env file not found at ${rootEnvPath}`);
		return false;
	}

	const parsed = parseEnvFile(await readFile(rootEnvPath, "utf8"));
	for (const [key, value] of Object.entries(parsed)) {
		state.env[key] = value;
		process.env[key] = value;
	}
	state.rootPath = rootPath;

	state.reporter.success("Environment variables loaded");
	return true;
}

function stepCheckDependencies(state: SetupState): boolean {
	console.log("Checking dependencies...");
	const missing: string[] = [];

	if (!commandExists("bun")) {
		missing.push("bun (Install from https://bun.sh)");
	}
	if (!commandExists("neonctl")) {
		missing.push("neonctl (Run: npm install -g neonctl)");
	}
	if (!commandExists("docker")) {
		missing.push("docker (Install from https://docker.com)");
	}
	if (!commandExists("caddy")) {
		state.reporter.warn(
			"caddy not found; HTTP/2 proxy for Electric will not work (Run: brew install caddy && caddy trust)",
		);
	}

	if (missing.length > 0) {
		state.reporter.error("Missing dependencies:");
		for (const dependency of missing) {
			console.log(`  - ${dependency}`);
		}
		return false;
	}

	state.reporter.success("All dependencies found");
	return true;
}

function stepInstallDependencies(state: SetupState): boolean {
	console.log("Installing dependencies...");
	if (!commandExists("bun")) {
		state.reporter.error("Bun not available, skipping dependency installation");
		return false;
	}

	if (!runCommand("bun", ["install"], { cwd: state.cwd })) {
		state.reporter.error("Failed to install dependencies");
		return false;
	}

	state.reporter.success("Dependencies installed");
	return true;
}

async function stepSeedLocalDb(state: SetupState): Promise<boolean> {
	console.log("Seeding local DB into superset-dev-data/...");

	const sourceDb = join(state.homeDir, ".superset", "local.db");
	const devDataDir = join(state.cwd, "superset-dev-data");
	const destDb = join(devDataDir, "local.db");

	if (state.args.forceOverwriteData && (await isDirectory(devDataDir))) {
		state.reporter.warn(
			`Force overwrite enabled; removing existing ${devDataDir}/`,
		);
		await rm(devDataDir, { recursive: true, force: true });
	}

	if (!(await isFile(sourceDb))) {
		state.reporter.warn(
			`No source local.db found at ${sourceDb}; skipping (app will create a fresh one)`,
		);
		state.reporter.stepSkipped("Seed local DB (no source DB)");
		return true;
	}

	if ((await isFile(destDb)) && !state.args.forceOverwriteData) {
		state.reporter.warn(
			`Destination DB already exists at ${destDb}; skipping seed (use -f/--force)`,
		);
		state.reporter.stepSkipped("Seed local DB (already exists)");
		return true;
	}

	await mkdir(devDataDir, { recursive: true });
	await chmodIfPossible(devDataDir, 0o700);
	await copySqliteFamily(sourceDb, destDb);
	await checkpointSqlite(destDb);

	state.reporter.success(`Local DB seeded from ${sourceDb}`);
	return true;
}

async function stepSeedHostDbs(state: SetupState): Promise<boolean> {
	console.log("Seeding host-service DBs into superset-dev-data/host/...");

	const sourceRoot = join(state.homeDir, ".superset", "host");
	const devDataDir = join(state.cwd, "superset-dev-data");
	const destRoot = join(devDataDir, "host");

	if (!(await isDirectory(sourceRoot))) {
		state.reporter.warn(
			`No host-service DBs found at ${sourceRoot}; skipping (host-service will create fresh DBs per org)`,
		);
		state.reporter.stepSkipped("Seed host-service DBs (no source dir)");
		return true;
	}

	const orgDirs = await getHostDbOrgIds(sourceRoot);
	if (orgDirs.length === 0) {
		state.reporter.warn(`No host.db files under ${sourceRoot}; skipping`);
		state.reporter.stepSkipped("Seed host-service DBs (no host.db files)");
		return true;
	}

	await mkdir(destRoot, { recursive: true });
	await chmodIfPossible(devDataDir, 0o700);
	await chmodIfPossible(destRoot, 0o700);

	let seeded = 0;
	let skipped = 0;
	for (const orgId of orgDirs) {
		const sourceDb = join(sourceRoot, orgId, "host.db");
		const destOrgDir = join(destRoot, orgId);
		const destDb = join(destOrgDir, "host.db");

		if ((await isFile(destDb)) && !state.args.forceOverwriteData) {
			state.reporter.warn(
				`Host DB already exists at ${destDb}; skipping (use -f/--force)`,
			);
			skipped += 1;
			continue;
		}

		await mkdir(destOrgDir, { recursive: true });
		await chmodIfPossible(destOrgDir, 0o700);

		if (state.args.forceOverwriteData) {
			await removeSqliteFamily(destDb);
		}

		try {
			await copySqliteFamily(sourceDb, destDb);
		} catch (error) {
			await removeSqliteFamily(destDb);
			throw error;
		}

		await checkpointSqlite(destDb);
		seeded += 1;
	}

	state.reporter.success(
		`Host-service DBs seeded (${seeded} copied, ${skipped} skipped) from ${sourceRoot}`,
	);
	return true;
}

async function stepSeedAuthToken(state: SetupState): Promise<boolean> {
	console.log("Seeding auth token into superset-dev-data/...");

	const sourceToken = join(state.homeDir, ".superset", "auth-token.enc");
	const devDataDir = join(state.cwd, "superset-dev-data");
	const destToken = join(devDataDir, "auth-token.enc");

	if (!(await isFile(sourceToken))) {
		state.reporter.warn(
			`No auth token found at ${sourceToken}; skipping (you will need to sign in)`,
		);
		state.reporter.stepSkipped("Seed auth token (no source token)");
		return true;
	}

	await mkdir(devDataDir, { recursive: true });
	await chmodIfPossible(devDataDir, 0o700);

	if ((await isFile(destToken)) && !state.args.forceOverwriteData) {
		state.reporter.warn(
			`Auth token already exists at ${destToken}; skipping (use -f/--force)`,
		);
		state.reporter.stepSkipped("Seed auth token (already exists)");
		return true;
	}

	await copyFile(sourceToken, destToken);
	await chmodIfPossible(destToken, 0o600);

	state.reporter.success(`Auth token seeded from ${sourceToken}`);
	return true;
}

function stepSetupNeonBranch(state: SetupState): boolean {
	console.log("Setting up Neon branch...");

	const projectId = state.env.NEON_PROJECT_ID ?? "";
	if (!projectId) {
		state.reporter.error("NEON_PROJECT_ID environment variable is required");
		return false;
	}

	if (!commandExists("neonctl")) {
		state.reporter.error("neonctl not available");
		return false;
	}

	const workspaceName =
		state.env.SUPERSET_WORKSPACE_NAME?.trim() || basename(state.cwd);
	state.workspaceName = workspaceName;

	const branchesResult = captureCommand("neonctl", [
		"branches",
		"list",
		"--project-id",
		projectId,
		"--output",
		"json",
	]);
	if (!branchesResult.ok) {
		printCapturedFailure(branchesResult);
		state.reporter.error("Failed to list Neon branches (check output above)");
		return false;
	}

	const branches = parseNeonBranches(branchesResult.stdout);
	if (!branches) {
		state.reporter.error("Neon branches list: Invalid JSON output");
		console.error("Raw output:");
		console.error(branchesResult.stdout);
		return false;
	}

	const existingBranch = branches.find(
		(branch) => branch.name === workspaceName,
	);
	if (existingBranch) {
		console.log("  Using existing Neon branch...");
		state.branchId = existingBranch.id;
	} else {
		console.log("  Creating new Neon branch...");
		const createResult = captureCommand("neonctl", [
			"branches",
			"create",
			"--project-id",
			projectId,
			"--name",
			workspaceName,
			"--output",
			"json",
		]);

		if (!createResult.ok) {
			printCapturedFailure(createResult);
			state.reporter.error("Failed to create Neon branch (check output above)");
			return false;
		}

		const branchId = parseCreatedBranchId(createResult.stdout);
		if (!branchId) {
			state.reporter.error("Branch ID not found in neonctl response");
			console.error("Response structure:");
			console.error(formatJsonForDebug(createResult.stdout));
			return false;
		}
		state.branchId = branchId;
	}

	const directResult = captureCommand("neonctl", [
		"connection-string",
		state.branchId,
		"--project-id",
		projectId,
		"--role-name",
		"neondb_owner",
	]);
	if (!directResult.ok) {
		printCapturedFailure(directResult);
		state.reporter.error(
			"Failed to get direct connection string (check output above)",
		);
		return false;
	}

	const pooledResult = captureCommand("neonctl", [
		"connection-string",
		state.branchId,
		"--project-id",
		projectId,
		"--role-name",
		"neondb_owner",
		"--pooled",
	]);
	if (!pooledResult.ok) {
		printCapturedFailure(pooledResult);
		state.reporter.error(
			"Failed to get pooled connection string (check output above)",
		);
		return false;
	}

	state.directUrl = directResult.stdout.trim();
	state.pooledUrl = pooledResult.stdout.trim();
	state.env.BRANCH_ID = state.branchId;
	state.env.DIRECT_URL = state.directUrl;
	state.env.POOLED_URL = state.pooledUrl;
	state.env.WORKSPACE_NAME = workspaceName;

	state.reporter.success(`Neon branch ready: ${workspaceName}`);
	return true;
}

async function stepAllocatePortBase(state: SetupState): Promise<boolean> {
	const allocFile = join(state.homeDir, ".superset", "port-allocations.json");
	const lockDir = join(state.homeDir, ".superset", "port-allocations.lock");
	const start = 3000;
	const range = 20;

	await mkdir(join(state.homeDir, ".superset"), { recursive: true });
	if (!(await isFile(allocFile))) {
		await writeFile(allocFile, "{}\n", "utf8");
	}

	if (!(await acquirePortAllocationLock(lockDir, 30, 300, state.reporter))) {
		return false;
	}

	try {
		const allocations = await readPortAllocations(allocFile);
		const existing = allocations[state.cwd];
		if (typeof existing === "number") {
			state.portBase = existing;
			state.env.SUPERSET_PORT_BASE = String(existing);
			return true;
		}

		const used = new Set(
			Object.values(allocations).filter(
				(value): value is number => typeof value === "number",
			),
		);
		let candidate = start;
		while (used.has(candidate)) {
			candidate += range;
		}

		allocations[state.cwd] = candidate;
		await writeJsonAtomic(allocFile, allocations);
		state.portBase = candidate;
		state.env.SUPERSET_PORT_BASE = String(candidate);
		return true;
	} catch (error) {
		state.reporter.error(errorToMessage(error));
		return false;
	} finally {
		await rm(lockDir, { recursive: true, force: true });
	}
}

async function stepStartElectric(state: SetupState): Promise<boolean> {
	console.log("Starting Electric SQL container...");

	if (!commandExists("docker")) {
		state.reporter.error("Docker not available");
		return false;
	}
	if (!state.directUrl) {
		state.reporter.error(
			"Database URL not available (Neon branch setup may have failed)",
		);
		return false;
	}
	if (state.portBase === undefined) {
		state.reporter.error("SUPERSET_PORT_BASE not set before starting Electric");
		return false;
	}

	const workspaceName = state.workspaceName ?? basename(state.cwd);
	const containerSuffix = workspaceName
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const electricContainer = `superset-electric-${containerSuffix}`.slice(0, 64);
	const electricSecret = state.env.ELECTRIC_SECRET || DEFAULT_ELECTRIC_SECRET;
	const electricPort = state.portBase + 9;

	const psResult = captureCommand("docker", [
		"ps",
		"-a",
		"--format",
		"{{.Names}}",
	]);
	if (psResult.ok) {
		const existingNames = psResult.stdout.split(/\r?\n/).filter(Boolean);
		if (existingNames.includes(electricContainer)) {
			console.log("  Stopping existing container...");
			captureCommand("docker", ["stop", electricContainer]);
			captureCommand("docker", ["rm", electricContainer]);
		}
	}

	console.log("  Clearing stale Electric replication sessions...");
	await cleanupStaleElectricReplicationSessions(state);

	const runResult = captureCommand("docker", [
		"run",
		"-d",
		"--name",
		electricContainer,
		"--restart",
		"on-failure:5",
		"-p",
		`${electricPort}:3000`,
		"-e",
		`DATABASE_URL=${state.directUrl}`,
		"-e",
		`ELECTRIC_SECRET=${electricSecret}`,
		ELECTRIC_IMAGE,
	]);
	if (!runResult.ok) {
		printCapturedFailure(runResult);
		state.reporter.error("Failed to start Electric container");
		return false;
	}

	console.log(`  Waiting for Electric to be ready on port ${electricPort}...`);
	let ready = false;
	let healthStatus = "unknown";
	for (let attempt = 1; attempt <= 60; attempt += 1) {
		healthStatus = await getElectricHealthStatus(electricPort);
		if (healthStatus === "active") {
			ready = true;
			break;
		}

		if (attempt % 10 === 0) {
			console.log(`  Electric status: ${healthStatus} (waiting for active)`);
		}

		await sleep(1000);
	}

	if (!ready) {
		state.reporter.error(
			`Electric failed to become active within 60s (last status: ${healthStatus}). Check logs: docker logs ${electricContainer}`,
		);
		return false;
	}

	state.electricContainer = electricContainer;
	state.electricPort = electricPort;
	state.electricUrl = `http://localhost:${electricPort}/v1/shape`;
	state.electricSecret = electricSecret;
	state.env.ELECTRIC_CONTAINER = electricContainer;
	state.env.ELECTRIC_PORT = String(electricPort);
	state.env.ELECTRIC_URL = state.electricUrl;
	state.env.ELECTRIC_SECRET = electricSecret;

	state.reporter.success(`Electric SQL running at ${state.electricUrl}`);
	return true;
}

async function stepWriteEnv(state: SetupState): Promise<boolean> {
	console.log("Writing .env file...");

	if (!state.rootPath) {
		state.reporter.error("Root .env file not available");
		return false;
	}

	const rootEnvPath = join(state.rootPath, ".env");
	if (!(await isFile(rootEnvPath))) {
		state.reporter.error("Root .env file not available");
		return false;
	}
	if (state.portBase === undefined) {
		state.reporter.error("SUPERSET_PORT_BASE not set before writing .env");
		return false;
	}

	const envFile = join(state.cwd, ".env");
	await copyFile(rootEnvPath, envFile);

	const ports = buildWorkspacePorts(state.portBase);
	state.ports = ports;

	const workspaceName = state.workspaceName ?? basename(state.cwd);
	const envUpdates: Array<[string, string | undefined]> = [
		["SUPERSET_WORKSPACE_NAME", workspaceName],
		["SUPERSET_HOME_DIR", join(state.cwd, "superset-dev-data")],
		["NEON_BRANCH_ID", state.branchId],
		["DATABASE_URL", state.pooledUrl],
		["DATABASE_URL_UNPOOLED", state.directUrl],
		["ELECTRIC_CONTAINER", state.electricContainer],
		["ELECTRIC_SECRET", state.electricSecret ?? state.env.ELECTRIC_SECRET],
		["SUPERSET_PORT_BASE", String(ports.base)],
		["WEB_PORT", String(ports.web)],
		["API_PORT", String(ports.api)],
		["MARKETING_PORT", String(ports.marketing)],
		["ADMIN_PORT", String(ports.admin)],
		["DOCS_PORT", String(ports.docs)],
		["DESKTOP_VITE_PORT", String(ports.desktopVite)],
		["DESKTOP_NOTIFICATIONS_PORT", String(ports.desktopNotifications)],
		["STREAMS_PORT", String(ports.streams)],
		["STREAMS_INTERNAL_PORT", String(ports.streamsInternal)],
		["ELECTRIC_PORT", String(ports.electric)],
		["CADDY_ELECTRIC_PORT", String(ports.caddyElectric)],
		["CODE_INSPECTOR_PORT", String(ports.codeInspector)],
		["DESKTOP_AUTOMATION_PORT", String(ports.desktopAutomation)],
		["WRANGLER_PORT", String(ports.wrangler)],
		["RELAY_PORT", String(ports.relay)],
		["NEXT_PUBLIC_API_URL", `http://localhost:${ports.api}`],
		["NEXT_PUBLIC_WEB_URL", `http://localhost:${ports.web}`],
		["NEXT_PUBLIC_MARKETING_URL", `http://localhost:${ports.marketing}`],
		["NEXT_PUBLIC_ADMIN_URL", `http://localhost:${ports.admin}`],
		["NEXT_PUBLIC_DOCS_URL", `http://localhost:${ports.docs}`],
		["NEXT_PUBLIC_DESKTOP_URL", `http://localhost:${ports.desktopVite}`],
		["EXPO_PUBLIC_WEB_URL", `http://localhost:${ports.web}`],
		["EXPO_PUBLIC_API_URL", `http://localhost:${ports.api}`],
		["RELAY_URL", `http://localhost:${ports.relay}`],
		["SUPERSET_WEB_URL", `http://localhost:${ports.web}`],
		["PORT", String(ports.streams)],
		["STREAMS_URL", `http://localhost:${ports.streams}`],
		["NEXT_PUBLIC_STREAMS_URL", `http://localhost:${ports.streams}`],
		["EXPO_PUBLIC_STREAMS_URL", `http://localhost:${ports.streams}`],
		["STREAMS_INTERNAL_URL", `http://127.0.0.1:${ports.streamsInternal}`],
		["ELECTRIC_URL", `http://localhost:${ports.electric}/v1/shape`],
		["NEXT_PUBLIC_ELECTRIC_URL", `https://localhost:${ports.caddyElectric}`],
		[
			"NEXT_PUBLIC_ELECTRIC_PROXY_URL",
			`https://localhost:${ports.caddyElectric}`,
		],
	];

	for (const [key, value] of envUpdates) {
		if (value !== undefined && value.length > 0) {
			await upsertEnvVar(envFile, key, value);
		}
	}

	state.reporter.success("Workspace .env written");

	await writeCaddyfile(state.cwd);
	state.reporter.success("Caddyfile written");

	await writePortsJson(state.scriptDir, ports);
	state.reporter.success("Port name mapping written to .superset/ports.json");

	await writeElectricProxyDevVars(state.cwd, ports, state);
	state.reporter.success("Electric proxy .dev.vars written");

	return true;
}

async function stepSetupLocalMcp(state: SetupState): Promise<boolean> {
	console.log("Setting up local MCP server in .mcp.json...");

	const mcpFile = join(state.cwd, ".mcp.json");
	if (!(await isFile(mcpFile))) {
		state.reporter.warn("No .mcp.json found; skipping local MCP setup");
		state.reporter.stepSkipped("Setup local MCP (no .mcp.json)");
		return true;
	}

	const apiPort = state.portBase === undefined ? 3001 : state.portBase + 1;
	const localUrl = `http://localhost:${apiPort}/api/agent/mcp`;

	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(mcpFile, "utf8"));
	} catch (error) {
		state.reporter.error(
			`Failed to parse ${mcpFile}: ${errorToMessage(error)}`,
		);
		return false;
	}

	if (!isRecord(parsed)) {
		state.reporter.error(`${mcpFile} must contain a JSON object`);
		return false;
	}

	const mcpServers = isRecord(parsed.mcpServers) ? parsed.mcpServers : {};
	mcpServers["superset-local"] = {
		type: "http",
		url: localUrl,
	};
	parsed.mcpServers = mcpServers;

	await writeJsonAtomic(mcpFile, parsed);
	state.reporter.success(`Local MCP set to ${localUrl}`);
	return true;
}

async function cleanupStaleElectricReplicationSessions(
	state: SetupState,
): Promise<void> {
	if (!commandExists("psql")) {
		state.reporter.warn(
			"psql not found; skipping stale Electric replication cleanup",
		);
		return;
	}
	if (!state.directUrl) {
		state.reporter.warn(
			"Direct database URL not available; skipping stale Electric replication cleanup",
		);
		return;
	}

	const sql = `WITH lock_pids AS (
  SELECT DISTINCT l.pid
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory'
    AND l.classid = 4294967295
    AND l.objid = hashtext('electric_slot_default')
    AND l.objsubid = 1
    AND a.pid <> pg_backend_pid()
),
repl_pids AS (
  SELECT pid
  FROM pg_stat_activity
  WHERE query LIKE 'START_REPLICATION SLOT "electric_slot_default"%'
    AND pid <> pg_backend_pid()
),
victims AS (
  SELECT pid FROM lock_pids
  UNION
  SELECT pid FROM repl_pids
)
SELECT COALESCE(SUM((pg_terminate_backend(pid))::int), 0)
FROM victims;
`;

	const result = captureCommand("psql", [state.directUrl, "-Atq"], {
		env: { PGCONNECT_TIMEOUT: "5" },
		input: sql,
	});
	const terminatedCount = Number.parseInt(result.stdout.trim(), 10);
	if (!result.ok || Number.isNaN(terminatedCount)) {
		state.reporter.warn(
			"Unable to verify stale Electric replication sessions (continuing)",
		);
		return;
	}

	if (terminatedCount > 0) {
		state.reporter.warn(
			`Terminated ${terminatedCount} stale Electric replication session(s)`,
		);
	} else {
		state.reporter.success("No stale Electric replication sessions found");
	}
}

async function getElectricHealthStatus(port: number): Promise<string> {
	const raw = await getHttpBody(`http://localhost:${port}/v1/health`, 1000);
	if (!raw) {
		return "unreachable";
	}

	try {
		const parsed: unknown = JSON.parse(raw);
		if (isRecord(parsed) && typeof parsed.status === "string") {
			return parsed.status;
		}
	} catch {
		return "unreachable";
	}

	return "unreachable";
}

function getHttpBody(
	url: string,
	timeoutMs: number,
): Promise<string | undefined> {
	return new Promise((resolve) => {
		const request = httpGet(url, (response) => {
			if (response.statusCode === undefined || response.statusCode >= 400) {
				response.resume();
				resolve(undefined);
				return;
			}

			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk: string) => {
				body += chunk;
			});
			response.on("end", () => {
				resolve(body);
			});
		});

		request.setTimeout(timeoutMs, () => {
			request.destroy();
			resolve(undefined);
		});
		request.on("error", () => {
			resolve(undefined);
		});
	});
}

async function acquirePortAllocationLock(
	lockDir: string,
	timeoutSeconds: number,
	staleSeconds: number,
	reporter: SetupReporter,
): Promise<boolean> {
	let waited = 0;

	while (true) {
		try {
			await mkdir(lockDir);
			await writeFile(join(lockDir, "pid"), `${process.pid}\n`, "utf8");
			return true;
		} catch (error) {
			if (!isNodeErrorWithCode(error, "EEXIST")) {
				reporter.error(
					`Failed to acquire port allocation lock: ${errorToMessage(error)}`,
				);
				return false;
			}
		}

		if (await cleanupStalePortAllocationLock(lockDir, staleSeconds, reporter)) {
			continue;
		}

		if (waited >= timeoutSeconds) {
			reporter.error(`Timed out waiting for port allocation lock: ${lockDir}`);
			return false;
		}

		await sleep(1000);
		waited += 1;
	}
}

async function cleanupStalePortAllocationLock(
	lockDir: string,
	staleSeconds: number,
	reporter: SetupReporter,
): Promise<boolean> {
	const pidFile = join(lockDir, "pid");
	try {
		const rawPid = (await readFile(pidFile, "utf8")).trim();
		const pid = Number.parseInt(rawPid, 10);
		if (Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid)) {
			reporter.warn(
				`Removing stale port allocation lock held by dead PID ${pid}`,
			);
			await rm(lockDir, { recursive: true, force: true });
			return true;
		}
	} catch {
		// Fall through to mtime-based stale lock handling.
	}

	try {
		const lockStats = await stat(lockDir);
		const ageMs = Date.now() - lockStats.mtimeMs;
		if (ageMs >= staleSeconds * 1000) {
			reporter.warn(
				`Removing stale port allocation lock older than ${staleSeconds}s`,
			);
			await rm(lockDir, { recursive: true, force: true });
			return true;
		}
	} catch {
		return false;
	}

	return false;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function readPortAllocations(
	allocFile: string,
): Promise<Record<string, number>> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(allocFile, "utf8"));
	} catch (error) {
		throw new Error(
			`Failed to read port allocations: ${allocFile}: ${errorToMessage(error)}`,
		);
	}

	if (!isRecord(parsed)) {
		throw new Error(`Failed to parse used port allocations: ${allocFile}`);
	}

	const allocations: Record<string, number> = {};
	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value === "number") {
			allocations[key] = value;
		}
	}
	return allocations;
}

function parseNeonBranches(output: string): NeonBranch[] | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return undefined;
	}

	const branchValues = Array.isArray(parsed)
		? parsed
		: isRecord(parsed) && Array.isArray(parsed.branches)
			? parsed.branches
			: undefined;

	if (!branchValues) {
		return undefined;
	}

	const branches: NeonBranch[] = [];
	for (const branch of branchValues) {
		if (
			isRecord(branch) &&
			typeof branch.id === "string" &&
			typeof branch.name === "string"
		) {
			branches.push({ id: branch.id, name: branch.name });
		}
	}
	return branches;
}

function parseCreatedBranchId(output: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return undefined;
	}

	if (isRecord(parsed)) {
		if (typeof parsed.id === "string") {
			return parsed.id;
		}
		if (isRecord(parsed.branch) && typeof parsed.branch.id === "string") {
			return parsed.branch.id;
		}
	}

	return undefined;
}

function formatJsonForDebug(output: string): string {
	try {
		return JSON.stringify(JSON.parse(output), null, 2);
	} catch {
		return output;
	}
}

function buildWorkspacePorts(base: number): WorkspacePorts {
	return {
		base,
		web: base,
		api: base + 1,
		marketing: base + 2,
		admin: base + 3,
		docs: base + 4,
		desktopVite: base + 5,
		desktopNotifications: base + 6,
		streams: base + 7,
		streamsInternal: base + 8,
		electric: base + 9,
		caddyElectric: base + 10,
		codeInspector: base + 11,
		desktopAutomation: base + 12,
		wrangler: base + 13,
		relay: base + 14,
	};
}

async function writeCaddyfile(cwd: string): Promise<void> {
	const content = `https://localhost:{$CADDY_ELECTRIC_PORT} {
\treverse_proxy localhost:{$WRANGLER_PORT} {
\t\tflush_interval -1
\t}
}
`;
	await writeFile(join(cwd, "Caddyfile"), content, "utf8");
}

async function writePortsJson(
	scriptDir: string,
	ports: WorkspacePorts,
): Promise<void> {
	const content = {
		ports: [
			{ port: ports.web, label: "Web" },
			{ port: ports.api, label: "API" },
			{ port: ports.marketing, label: "Marketing" },
			{ port: ports.admin, label: "Admin" },
			{ port: ports.docs, label: "Docs" },
			{ port: ports.desktopVite, label: "Desktop Vite" },
			{ port: ports.desktopNotifications, label: "Notifications" },
			{ port: ports.streams, label: "Streams" },
			{ port: ports.streamsInternal, label: "Streams Internal" },
			{ port: ports.electric, label: "Electric" },
			{ port: ports.caddyElectric, label: "Caddy Electric" },
			{ port: ports.codeInspector, label: "Code Inspector" },
			{ port: ports.wrangler, label: "Electric Proxy (Wrangler)" },
		],
	};
	await writeFile(
		join(scriptDir, "ports.json"),
		`${JSON.stringify(content, null, 2)}\n`,
	);
}

async function writeElectricProxyDevVars(
	cwd: string,
	ports: WorkspacePorts,
	state: SetupState,
): Promise<void> {
	const content = `AUTH_URL=http://localhost:${ports.api}
ELECTRIC_SHAPE_URL=http://localhost:${ports.electric}/v1/shape
ELECTRIC_SECRET=${state.electricSecret ?? state.env.ELECTRIC_SECRET ?? DEFAULT_ELECTRIC_SECRET}
ELECTRIC_SOURCE_ID=${state.env.ELECTRIC_SOURCE_ID ?? ""}
ELECTRIC_SOURCE_SECRET=${state.env.ELECTRIC_SOURCE_SECRET ?? ""}
`;
	await writeFile(
		join(cwd, "apps", "electric-proxy", ".dev.vars"),
		content,
		"utf8",
	);
}

async function getHostDbOrgIds(sourceRoot: string): Promise<string[]> {
	const entries = await readdir(sourceRoot, { withFileTypes: true });
	const orgIds: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const hostDb = join(sourceRoot, entry.name, "host.db");
		if (await isFile(hostDb)) {
			orgIds.push(entry.name);
		}
	}
	return orgIds;
}

async function copySqliteFamily(
	sourceDb: string,
	destDb: string,
): Promise<void> {
	for (const suffix of ["", "-shm", "-wal"]) {
		const sourceFile = `${sourceDb}${suffix}`;
		const destFile = `${destDb}${suffix}`;
		if (await isFile(sourceFile)) {
			await copyFile(sourceFile, destFile);
			await chmodIfPossible(destFile, 0o600);
		}
	}
}

async function removeSqliteFamily(destDb: string): Promise<void> {
	await Promise.all(
		["", "-shm", "-wal"].map((suffix) =>
			rm(`${destDb}${suffix}`, { force: true }),
		),
	);
}

async function checkpointSqlite(dbPath: string): Promise<void> {
	if (!commandExists("sqlite3")) {
		return;
	}

	captureCommand("sqlite3", [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"]);
}

async function writeJsonAtomic(
	filePath: string,
	value: unknown,
): Promise<void> {
	const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
	await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmpPath, filePath);
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function chmodIfPossible(path: string, mode: number): Promise<void> {
	try {
		await chmod(path, mode);
	} catch {
		// Keep setup moving on filesystems that do not support POSIX modes.
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
