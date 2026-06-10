#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
process.chdir(rootDir);
const electricSecret = "local_electric_dev_secret";
const reservedPorts = new Set([
	3659, 4045, 5000, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
	7000,
]);

interface Args {
	dryRun: boolean;
	skipInstall: boolean;
	skipDb: boolean;
	skipMigrate: boolean;
	skipSeed: boolean;
	help: boolean;
}

interface LocalPorts {
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
	wrangler: number;
	relay: number;
	postgres: number;
	neonProxy: number;
}

const args = parseArgs(process.argv.slice(2));
const failedSteps: string[] = [];
const skippedSteps: string[] = [];

let localDbProject = "";
let localPorts: LocalPorts | null = null;

if (args.help) {
	printHelp();
	process.exit(0);
}

await localSetupMain();

async function localSetupMain(): Promise<void> {
	console.log("Setting up Superset for LOCAL development...");
	if (args.dryRun) {
		warn("Dry run enabled - commands and file writes will be printed only");
	}
	console.log("");

	await runStep("Prepare .env", ensureEnv);
	await runStep("Check dependencies", checkDependencies);
	await runStep("Install dependencies", installDependencies);
	await runStep("Allocate ports", allocatePorts);
	await runStep("Write workspace .env", writeWorkspaceEnv);
	await runStep("Start local DB stack", startLocalDbStack);
	await runStep("Apply migrations", applyMigrations);
	await runStep("Seed dev account", seedDevAccount);
	await runStep("Write config overlay", writeConfigOverlay);

	printSummary("Local setup");
	process.exit(failedSteps.length > 0 ? 1 : 0);
}

async function runStep(
	name: string,
	step: () => Promise<void> | void,
): Promise<void> {
	try {
		await step();
	} catch (error) {
		failedSteps.push(name);
		printError(error instanceof Error ? error.message : String(error));
	}
}

function ensureEnv(): void {
	console.log("Preparing .env...");
	const envPath = join(rootDir, ".env");
	const examplePath = join(rootDir, ".env.local.example");
	if (existsSync(envPath)) {
		success(".env already exists - leaving as-is");
		return;
	}
	if (!existsSync(examplePath)) {
		throw new Error(`.env.local.example not found in ${rootDir}`);
	}
	if (args.dryRun) {
		console.log(`[dry-run] copy ${examplePath} -> ${envPath}`);
	} else {
		copyFileSync(examplePath, envPath);
	}
	success("Created .env from .env.local.example");
}

function checkDependencies(): void {
	console.log("Checking dependencies...");
	const missing: string[] = [];
	if (!hasCommand("bun", ["--version"])) missing.push("bun (https://bun.sh)");
	if (!hasCommand("docker", ["--version"])) {
		missing.push("docker (https://docker.com)");
	}
	if (!hasCommand("caddy", ["version"])) {
		warn(
			"caddy not found - Electric HTTPS proxy will not work (install Caddy and run caddy trust)",
		);
	}
	if (missing.length > 0) {
		if (args.dryRun) {
			warn(
				`Dry run continuing despite missing dependencies:\n${missing.map((m) => `  - ${m}`).join("\n")}`,
			);
			return;
		}
		throw new Error(
			`Missing dependencies:\n${missing.map((m) => `  - ${m}`).join("\n")}`,
		);
	}
	success("All required dependencies found");
}

function installDependencies(): void {
	if (args.skipInstall) {
		skippedSteps.push("Install dependencies (--skip-install)");
		warn("Skipping dependency installation");
		return;
	}
	console.log("Installing dependencies...");
	runCommand("bun", ["install"]);
	success("Dependencies installed");
}

function allocatePorts(): void {
	console.log("Allocating per-workspace ports...");
	const base = allocatePortBase();
	const workspaceName =
		process.env.SUPERSET_WORKSPACE_NAME || basename(process.cwd());
	localDbProject = `superset-${sanitizeName(workspaceName)}`;
	localPorts = {
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
		wrangler: base + 12,
		relay: base + 13,
		postgres: base + 14,
		neonProxy: base + 15,
	};
	process.env.SUPERSET_PORT_BASE = String(base);
	process.env.LOCAL_PG_PORT = String(localPorts.postgres);
	process.env.LOCAL_NEON_PROXY_PORT = String(localPorts.neonProxy);
	process.env.LOCAL_ELECTRIC_PORT = String(localPorts.electric);
	process.env.DATABASE_URL = `postgres://postgres:postgres@db.localtest.me:${localPorts.neonProxy}/main`;
	process.env.DATABASE_URL_UNPOOLED = `postgres://postgres:postgres@localhost:${localPorts.postgres}/main`;
	success(
		`Base ${base} -> pg=${localPorts.postgres} proxy=${localPorts.neonProxy} electric=${localPorts.electric} (project ${localDbProject})`,
	);
}

function writeWorkspaceEnv(): void {
	console.log("Writing workspace .env (DB URLs + ports)...");
	const ports = requirePorts();
	const workspaceName =
		process.env.SUPERSET_WORKSPACE_NAME || basename(process.cwd());
	const envBlock = [
		"",
		"# ===== Local workspace overrides (setup.local.ts) =====",
		writeEnvVar("SUPERSET_WORKSPACE_NAME", workspaceName),
		writeEnvVar("SUPERSET_HOME_DIR", join(process.cwd(), "superset-dev-data")),
		writeEnvVar("SUPERSET_PORT_BASE", String(ports.base)),
		"",
		`# Per-workspace local DB stack (docker compose project ${localDbProject})`,
		writeEnvVar("LOCAL_PG_PORT", String(ports.postgres)),
		writeEnvVar("LOCAL_NEON_PROXY_PORT", String(ports.neonProxy)),
		writeEnvVar("LOCAL_ELECTRIC_PORT", String(ports.electric)),
		writeEnvVar("DATABASE_URL", process.env.DATABASE_URL || ""),
		writeEnvVar(
			"DATABASE_URL_UNPOOLED",
			process.env.DATABASE_URL_UNPOOLED || "",
		),
		"",
		"# Workspace ports",
		writeEnvVar("WEB_PORT", String(ports.web)),
		writeEnvVar("API_PORT", String(ports.api)),
		writeEnvVar("MARKETING_PORT", String(ports.marketing)),
		writeEnvVar("ADMIN_PORT", String(ports.admin)),
		writeEnvVar("DOCS_PORT", String(ports.docs)),
		writeEnvVar("DESKTOP_VITE_PORT", String(ports.desktopVite)),
		writeEnvVar(
			"DESKTOP_NOTIFICATIONS_PORT",
			String(ports.desktopNotifications),
		),
		writeEnvVar("STREAMS_PORT", String(ports.streams)),
		writeEnvVar("STREAMS_INTERNAL_PORT", String(ports.streamsInternal)),
		writeEnvVar("CADDY_ELECTRIC_PORT", String(ports.caddyElectric)),
		writeEnvVar("CODE_INSPECTOR_PORT", String(ports.codeInspector)),
		writeEnvVar("WRANGLER_PORT", String(ports.wrangler)),
		writeEnvVar("RELAY_PORT", String(ports.relay)),
		writeEnvVar("ELECTRIC_PORT", String(ports.electric)),
		writeEnvVar("ELECTRIC_SECRET", electricSecret),
		"",
		"# Cross-app URLs (allocated ports)",
		writeEnvVar("NEXT_PUBLIC_API_URL", `http://localhost:${ports.api}`),
		writeEnvVar("NEXT_PUBLIC_WEB_URL", `http://localhost:${ports.web}`),
		writeEnvVar(
			"NEXT_PUBLIC_MARKETING_URL",
			`http://localhost:${ports.marketing}`,
		),
		writeEnvVar("NEXT_PUBLIC_ADMIN_URL", `http://localhost:${ports.admin}`),
		writeEnvVar("NEXT_PUBLIC_DOCS_URL", `http://localhost:${ports.docs}`),
		writeEnvVar(
			"NEXT_PUBLIC_DESKTOP_URL",
			`http://localhost:${ports.desktopVite}`,
		),
		writeEnvVar("RELAY_URL", `http://localhost:${ports.relay}`),
		writeEnvVar("NEXT_PUBLIC_RELAY_URL", `http://localhost:${ports.relay}`),
		writeEnvVar("SUPERSET_WEB_URL", `http://localhost:${ports.web}`),
		"",
		"# Streams URLs",
		writeEnvVar("PORT", String(ports.streams)),
		writeEnvVar("STREAMS_URL", `http://localhost:${ports.streams}`),
		writeEnvVar("NEXT_PUBLIC_STREAMS_URL", `http://localhost:${ports.streams}`),
		writeEnvVar(
			"STREAMS_INTERNAL_URL",
			`http://127.0.0.1:${ports.streamsInternal}`,
		),
		"",
		`# Electric URLs (per-workspace Electric :${ports.electric}, fronted by Caddy)`,
		writeEnvVar("ELECTRIC_URL", `http://localhost:${ports.electric}/v1/shape`),
		writeEnvVar(
			"NEXT_PUBLIC_ELECTRIC_URL",
			`https://localhost:${ports.caddyElectric}`,
		),
		writeEnvVar(
			"NEXT_PUBLIC_ELECTRIC_PROXY_URL",
			`https://localhost:${ports.caddyElectric}`,
		),
	].join("\n");

	writeFile(join(rootDir, ".env"), `${envBlock}\n`, { append: true });

	writeFile(
		join(rootDir, "Caddyfile"),
		[
			"{",
			"\tauto_https disable_redirects",
			"}",
			"",
			"https://localhost:{$CADDY_ELECTRIC_PORT} {",
			"\treverse_proxy localhost:{$WRANGLER_PORT} {",
			"\t\tflush_interval -1",
			"\t}",
			"}",
			"",
		].join("\n"),
	);

	writeFile(
		join(rootDir, "apps", "electric-proxy", ".dev.vars"),
		[
			`AUTH_URL=http://localhost:${ports.api}`,
			`ELECTRIC_SHAPE_URL=http://localhost:${ports.electric}/v1/shape`,
			`ELECTRIC_SECRET=${electricSecret}`,
			"ELECTRIC_SOURCE_ID=",
			"ELECTRIC_SOURCE_SECRET=",
			"",
		].join("\n"),
	);

	writeJson(join(scriptDir, "ports.json"), {
		ports: [
			{ port: ports.web, label: "Web" },
			{ port: ports.api, label: "API" },
			{ port: ports.marketing, label: "Marketing" },
			{ port: ports.admin, label: "Admin" },
			{ port: ports.docs, label: "Docs" },
			{ port: ports.desktopVite, label: "Desktop Vite" },
			{ port: ports.desktopNotifications, label: "Notifications" },
			{ port: ports.streams, label: "Streams" },
			{ port: ports.electric, label: "Electric" },
			{ port: ports.caddyElectric, label: "Caddy Electric" },
			{ port: ports.wrangler, label: "Electric Proxy (Wrangler)" },
			{ port: ports.postgres, label: "Postgres" },
			{ port: ports.neonProxy, label: "Neon Proxy" },
		],
	});
	success(
		"Workspace .env, Caddyfile, electric-proxy/.dev.vars, ports.json written",
	);
}

async function startLocalDbStack(): Promise<void> {
	if (args.skipDb) {
		skippedSteps.push("Start local DB stack (--skip-db)");
		warn("Skipping local DB stack startup");
		return;
	}
	const ports = requirePorts();
	console.log(`Starting per-workspace DB stack (${localDbProject})...`);
	runCommand("docker", [
		"compose",
		"-p",
		localDbProject,
		"-f",
		join(rootDir, "docker-compose.yml"),
		"up",
		"-d",
	]);
	if (args.dryRun) {
		success("DB stack ready (dry run)");
		return;
	}

	console.log("  Waiting for Postgres to be healthy...");
	const containerId = captureCommand("docker", [
		"compose",
		"-p",
		localDbProject,
		"-f",
		join(rootDir, "docker-compose.yml"),
		"ps",
		"-q",
		"postgres",
	]).trim();
	if (!containerId) throw new Error("Postgres container not found");

	let pgReady = false;
	for (let i = 0; i < 30; i++) {
		const health = captureCommand(
			"docker",
			["inspect", "--format", "{{.State.Health.Status}}", containerId],
			{ allowFailure: true },
		).trim();
		if (health === "healthy") {
			pgReady = true;
			break;
		}
		await sleep(2000);
	}
	if (!pgReady) throw new Error("Postgres did not become healthy within 60s");

	console.log(
		`  Waiting for neon-proxy to serve queries on :${ports.neonProxy}...`,
	);
	let proxyReady = false;
	for (let i = 0; i < 30; i++) {
		if (await probeNeonProxy(ports.neonProxy)) {
			proxyReady = true;
			break;
		}
		await sleep(1000);
	}
	if (!proxyReady) {
		throw new Error("neon-proxy did not become ready within 30s");
	}
	success(
		`DB stack ready (pg :${ports.postgres}, proxy :${ports.neonProxy}, electric :${ports.electric})`,
	);
}

function applyMigrations(): void {
	if (args.skipMigrate || args.skipDb) {
		skippedSteps.push("Apply migrations (--skip-migrate/--skip-db)");
		warn("Skipping database migrations");
		return;
	}
	console.log("Applying database migrations...");
	runCommand("bun", ["run", "db:migrate"]);
	success("Migrations applied");
}

function seedDevAccount(): void {
	if (args.skipSeed || args.skipDb) {
		skippedSteps.push("Seed dev account (--skip-seed/--skip-db)");
		warn("Skipping dev account seed");
		return;
	}
	console.log("Seeding dev account (onboarded + pro)...");
	runCommand("bun", ["run", "db:seed-dev"]);
	success("Dev account ready (sign in via the dev button)");
}

function writeConfigOverlay(): void {
	console.log("Writing .superset/config.local.json (untracked overlay)...");
	writeJson(join(scriptDir, "config.local.json"), {
		setup: ["bun ./.superset/setup.local.ts"],
		teardown: ["bun ./.superset/teardown.local.ts"],
	});
	success("config.local.json written - worktrees will use setup.local.ts");
}

function allocatePortBase(): number {
	const home = process.env.HOME || process.env.USERPROFILE || homedir();
	const stateDir = join(home, ".superset");
	const allocFile = join(stateDir, "port-allocations.json");
	const lockDir = join(stateDir, "port-allocations.lock");
	mkdirSync(stateDir, { recursive: true });
	if (!existsSync(allocFile) && !args.dryRun) writeFileSync(allocFile, "{}\n");

	acquirePortAllocationLock(lockDir);
	try {
		const allocations = readAllocations(allocFile);
		const key = process.cwd();
		const existing = allocations[key];
		if (typeof existing === "number") {
			if (portBaseIsSafe(existing, 20)) return existing;
			console.log(
				`  Existing port base ${existing} overlaps a reserved port; reallocating...`,
			);
			delete allocations[key];
		}

		const used = new Set(Object.values(allocations));
		let candidate = 3000;
		while (used.has(candidate) || !portBaseIsSafe(candidate, 20)) {
			candidate += 20;
		}
		allocations[key] = candidate;
		if (args.dryRun) {
			console.log(`[dry-run] write ${allocFile} with ${key}=${candidate}`);
		} else {
			writeJsonAtomic(allocFile, allocations);
		}
		return candidate;
	} finally {
		releasePortAllocationLock(lockDir);
	}
}

function acquirePortAllocationLock(lockDir: string): void {
	const timeoutMs = 30_000;
	const staleMs = 300_000;
	const start = Date.now();
	while (true) {
		try {
			if (!args.dryRun) {
				mkdirSync(lockDir);
				writeFileSync(
					join(lockDir, "pid"),
					`${process.pid}\n${new Date().toISOString()}\n`,
				);
			}
			return;
		} catch {
			const pidPath = join(lockDir, "pid");
			let cleanedStale = false;
			try {
				const [pidLine] = readFileSync(pidPath, "utf-8").split(/\r?\n/);
				const pid = Number(pidLine);
				if (Number.isFinite(pid) && !isProcessAlive(pid)) {
					warn(`Removing stale port allocation lock held by dead PID ${pid}`);
					rmSync(lockDir, { recursive: true, force: true });
					cleanedStale = true;
				}
			} catch {
				try {
					const age = Date.now() - statSync(lockDir).mtimeMs;
					if (age > staleMs) {
						rmSync(lockDir, { recursive: true, force: true });
						cleanedStale = true;
					}
				} catch {
					// Keep waiting until timeout.
				}
			}
			if (cleanedStale) continue;
			if (Date.now() - start > timeoutMs) {
				throw new Error(
					`Timed out waiting for port allocation lock: ${lockDir}`,
				);
			}
			sleepSync(100);
		}
	}
}

function releasePortAllocationLock(lockDir: string): void {
	if (args.dryRun) return;
	rmSync(lockDir, { recursive: true, force: true });
}

function readAllocations(filePath: string): Record<string, number> {
	if (!existsSync(filePath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		const result: Record<string, number> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "number") result[key] = value;
		}
		return result;
	} catch (error) {
		throw new Error(
			`Failed to parse port allocations at ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

function writeJsonAtomic(filePath: string, value: unknown): void {
	const tmpFile = `${filePath}.tmp.${process.pid}`;
	writeFileSync(tmpFile, `${JSON.stringify(value, null, 2)}\n`);
	renameSync(tmpFile, filePath);
}

function portBaseIsSafe(base: number, range: number): boolean {
	for (let port = base; port < base + range; port++) {
		if (reservedPorts.has(port)) return false;
	}
	return true;
}

function sanitizeName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
}

function hasCommand(command: string, commandArgs: string[]): boolean {
	const result = spawnSync(command, commandArgs, { stdio: "ignore" });
	return result.status === 0;
}

function runCommand(command: string, commandArgs: string[]): void {
	if (args.dryRun) {
		console.log(`[dry-run] ${[command, ...commandArgs].join(" ")}`);
		return;
	}
	const result = spawnSync(command, commandArgs, {
		cwd: rootDir,
		stdio: "inherit",
		env: process.env,
		shell: false,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${command} ${commandArgs.join(" ")} failed`);
	}
}

function captureCommand(
	command: string,
	commandArgs: string[],
	options: { allowFailure?: boolean } = {},
): string {
	const result = spawnSync(command, commandArgs, {
		cwd: rootDir,
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
		encoding: "utf-8",
		shell: false,
	});
	if (result.error) {
		if (options.allowFailure) return "";
		throw result.error;
	}
	if (result.status !== 0 && !options.allowFailure) {
		throw new Error(
			result.stderr || `${command} ${commandArgs.join(" ")} failed`,
		);
	}
	return result.stdout || "";
}

async function probeNeonProxy(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://localhost:${port}/sql`, {
			method: "POST",
			headers: {
				"Neon-Connection-String": `postgres://postgres:postgres@db.localtest.me:${port}/main`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: "select 1", params: [] }),
			signal: AbortSignal.timeout(3000),
		});
		const text = await response.text();
		return text.includes('"command"');
	} catch {
		return false;
	}
}

function writeEnvVar(key: string, value: string): string {
	return `${key}="${escapeEnvValue(value)}"`;
}

function escapeEnvValue(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$")
		.replaceAll("`", "\\`")
		.replaceAll("\n", "\\n");
}

function writeFile(
	filePath: string,
	content: string,
	options: { append?: boolean } = {},
): void {
	if (args.dryRun) {
		console.log(`[dry-run] ${options.append ? "append" : "write"} ${filePath}`);
		return;
	}
	if (options.append) {
		writeFileSync(filePath, content, { flag: "a" });
	} else {
		writeFileSync(filePath, content);
	}
}

function writeJson(filePath: string, value: unknown): void {
	writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`);
}

function requirePorts(): LocalPorts {
	if (!localPorts) throw new Error("Ports not allocated");
	return localPorts;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseArgs(argv: string[]): Args {
	return {
		dryRun: argv.includes("--dry-run"),
		skipInstall: argv.includes("--skip-install"),
		skipDb: argv.includes("--skip-db"),
		skipMigrate: argv.includes("--skip-migrate"),
		skipSeed: argv.includes("--skip-seed"),
		help: argv.includes("-h") || argv.includes("--help"),
	};
}

function printHelp(): void {
	console.log(`Usage: bun ./.superset/setup.local.ts [options]

Options:
  --dry-run       Print commands and writes without mutating files or services
  --skip-install  Skip bun install
  --skip-db       Skip docker compose startup, migrations, and seed
  --skip-migrate  Skip bun run db:migrate
  --skip-seed     Skip bun run db:seed-dev
  -h, --help      Show this help
`);
}

function printSummary(title: string): void {
	console.log("");
	console.log(`${title} Summary`);
	console.log("=".repeat(`${title} Summary`.length));
	if (failedSteps.length === 0) {
		success("All steps completed successfully");
	} else {
		printError(`Failed steps: ${failedSteps.join(", ")}`);
	}
	if (skippedSteps.length > 0) {
		warn(`Skipped steps: ${skippedSteps.join(", ")}`);
	}
}

function success(message: string): void {
	console.log(`[ok] ${message}`);
}

function warn(message: string): void {
	console.warn(`[warn] ${message}`);
}

function printError(message: string): void {
	console.error(`[error] ${message}`);
}
