#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const localWorktreeSlug = toSlug(basename(root), "-");
const localWorktreeHash = createHash("sha1")
	.update(root)
	.digest("hex")
	.slice(0, 6);
const localWorkspaceName = [
	"local-dev",
	localWorktreeSlug.slice(0, 15),
	localWorktreeHash,
].join("-");
const localDatabaseName = [
	"superset_local",
	toSlug(basename(root), "_").slice(0, 32),
	localWorktreeHash,
].join("_");
const LOCAL_DATABASE_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]",
]);
const LOCAL_DATABASE_USER = "superset";
const LOCAL_DATABASE_PASSWORD = "superset";
const LOCAL_DATABASE_PORT = "5433";
const LOCAL_POSTGRES_CONTAINER = "superset-pg";
const LOCAL_ELECTRIC_CONTAINER = "superset-electric";
const DOCKER_COMPOSE_ARGS = [
	"compose",
	"-p",
	"superset-local",
	"-f",
	"docker-compose.dev.yml",
];

const help = `Usage: bun setup:local [options]

Prepares a fresh-clone local contributor setup without cloud credentials.

Options:
  --skip-docker       Do not start Docker Postgres/Electric
  --skip-migrate      Do not run database migrations
  --skip-caddy-trust  Do not run caddy trust
  -h, --help          Show this help
`;

function log(message: string): void {
	console.log(`[setup:local] ${message}`);
}

function fail(message: string): never {
	console.error(`[setup:local] ${message}`);
	process.exit(1);
}

function run(
	command: string,
	commandArgs: string[],
	env: Record<string, string | undefined> = {},
): void {
	log(`$ ${[command, ...commandArgs].join(" ")}`);
	const result = spawnSync(command, commandArgs, {
		cwd: root,
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
	if (result.status !== 0) {
		fail(`${command} ${commandArgs.join(" ")} failed`);
	}
}

function runOutput(command: string, commandArgs: string[]): string {
	const result = spawnSync(command, commandArgs, {
		cwd: root,
		encoding: "utf8",
		env: process.env,
	});
	if (result.status !== 0) {
		fail(
			`${command} ${commandArgs.join(" ")} failed\n${result.stderr ?? ""}`.trim(),
		);
	}
	return result.stdout;
}

function commandExists(command: string): boolean {
	const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
		cwd: root,
		stdio: "ignore",
	});
	return result.status === 0;
}

function requireCommand(command: string, installHint: string): void {
	if (!commandExists(command)) {
		fail(`${command} is required. ${installHint}`);
	}
}

function copyIfMissing(source: string, destination: string): void {
	const sourcePath = resolve(root, source);
	const destinationPath = resolve(root, destination);
	if (existsSync(destinationPath)) {
		log(`keeping existing ${destination}`);
		return;
	}
	copyFileSync(sourcePath, destinationPath);
	log(`created ${destination} from ${basename(source)}`);
}

function toSlug(value: string, separator: "-" | "_"): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, separator)
			.replace(new RegExp(`^\\${separator}+|\\${separator}+$`, "g"), "") ||
		"dev"
	);
}

function localDatabaseUrl(databaseName: string): string {
	return `postgres://${LOCAL_DATABASE_USER}:${LOCAL_DATABASE_PASSWORD}@localhost:${LOCAL_DATABASE_PORT}/${databaseName}`;
}

function readEnvValue(name: string): string | undefined {
	const envPath = resolve(root, ".env");
	if (!existsSync(envPath)) return undefined;
	const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const [key, ...valueParts] = trimmed.split("=");
		if (key === name) {
			return valueParts.join("=").replace(/^["']|["']$/g, "");
		}
	}
	return undefined;
}

function writeEnvValues(values: Record<string, string>): void {
	const envPath = resolve(root, ".env");
	const original = readFileSync(envPath, "utf8");
	const seen = new Set<string>();
	const lines = original.split(/\r?\n/).map((line) => {
		const match = line.match(/^([A-Z0-9_]+)=/);
		if (!match) return line;

		const key = match[1];
		const value = values[key];
		if (value === undefined) return line;

		seen.add(key);
		return `${key}=${value}`;
	});

	for (const [key, value] of Object.entries(values)) {
		if (!seen.has(key)) {
			lines.push(`${key}=${value}`);
		}
	}

	const next = lines.join("\n");
	if (next !== original) {
		writeFileSync(envPath, next);
		log("updated .env with this worktree's local database settings");
	}
}

function isLocalDatabaseUrl(value: string | undefined): boolean {
	if (!value) return false;
	try {
		const url = new URL(value);
		return LOCAL_DATABASE_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
}

function isLocalWorkspaceName(value: string | undefined): boolean {
	return value === "local-dev" || Boolean(value?.startsWith("local-dev-"));
}

function normalizeLocalEnv(): void {
	const profile = readEnvValue("SUPERSET_PROFILE");
	const workspaceName = readEnvValue("SUPERSET_WORKSPACE_NAME");
	if (profile !== "local" || !isLocalWorkspaceName(workspaceName)) {
		fail(
			[
				"existing .env is not the default contributor profile, so setup stopped before running migrations",
				"expected: SUPERSET_PROFILE=local",
				"expected: SUPERSET_WORKSPACE_NAME=local-dev or local-dev-*",
				"move your existing .env aside or update it intentionally, then rerun bun setup:local",
			].join("\n"),
		);
	}

	if (!isLocalDatabaseUrl(readEnvValue("DATABASE_URL"))) {
		fail("DATABASE_URL must point at localhost for bun setup:local.");
	}

	if (!isLocalDatabaseUrl(readEnvValue("DATABASE_URL_UNPOOLED"))) {
		fail("DATABASE_URL_UNPOOLED must point at localhost for bun setup:local.");
	}

	writeEnvValues({
		SUPERSET_WORKSPACE_NAME: localWorkspaceName,
		SUPERSET_LOCAL_DATABASE_NAME: localDatabaseName,
		DATABASE_URL: localDatabaseUrl(localDatabaseName),
		DATABASE_URL_UNPOOLED: localDatabaseUrl(localDatabaseName),
	});
}

function dockerContainerExists(name: string): boolean {
	const result = spawnSync("docker", ["inspect", name], {
		cwd: root,
		stdio: "ignore",
	});
	return result.status === 0;
}

function dockerContainerEnvValue(
	containerName: string,
	envName: string,
): string | undefined {
	if (!dockerContainerExists(containerName)) return undefined;
	const output = runOutput("docker", [
		"inspect",
		"--format",
		"{{range .Config.Env}}{{println .}}{{end}}",
		containerName,
	]);
	const line = output
		.split(/\r?\n/)
		.find((item) => item.startsWith(`${envName}=`));
	return line?.slice(envName.length + 1);
}

function sleep(seconds: number): void {
	spawnSync("sleep", [String(seconds)], { stdio: "ignore" });
}

function waitForPostgres(): void {
	for (let attempt = 0; attempt < 30; attempt++) {
		const result = spawnSync(
			"docker",
			[
				"exec",
				LOCAL_POSTGRES_CONTAINER,
				"pg_isready",
				"-U",
				LOCAL_DATABASE_USER,
				"-d",
				"postgres",
			],
			{ cwd: root, stdio: "ignore" },
		);
		if (result.status === 0) return;
		sleep(1);
	}

	fail("Postgres did not become ready.");
}

function ensureLocalPostgres(): void {
	if (dockerContainerExists(LOCAL_POSTGRES_CONTAINER)) {
		run("docker", ["start", LOCAL_POSTGRES_CONTAINER]);
	} else {
		run("docker", [...DOCKER_COMPOSE_ARGS, "up", "-d", "postgres"]);
	}

	waitForPostgres();
}

function ensureLocalDatabase(databaseName: string): void {
	const exists = runOutput("docker", [
		"exec",
		LOCAL_POSTGRES_CONTAINER,
		"psql",
		"-U",
		LOCAL_DATABASE_USER,
		"-d",
		"postgres",
		"-tAc",
		`SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
	]).trim();

	if (exists === "1") {
		log(`database ${databaseName} already exists`);
		return;
	}

	run("docker", [
		"exec",
		LOCAL_POSTGRES_CONTAINER,
		"psql",
		"-U",
		LOCAL_DATABASE_USER,
		"-d",
		"postgres",
		"-c",
		`CREATE DATABASE ${databaseName}`,
	]);
}

function ensureLocalElectric(databaseName: string): void {
	const expectedDatabaseUrl = `postgres://${LOCAL_DATABASE_USER}:${LOCAL_DATABASE_PASSWORD}@host.docker.internal:${LOCAL_DATABASE_PORT}/${databaseName}`;
	const currentDatabaseUrl = dockerContainerEnvValue(
		LOCAL_ELECTRIC_CONTAINER,
		"DATABASE_URL",
	);

	if (currentDatabaseUrl && currentDatabaseUrl !== expectedDatabaseUrl) {
		log("recreating Electric for this worktree's local database");
		run("docker", ["rm", "-f", LOCAL_ELECTRIC_CONTAINER]);
	}

	if (dockerContainerExists(LOCAL_ELECTRIC_CONTAINER)) {
		run("docker", ["start", LOCAL_ELECTRIC_CONTAINER]);
		return;
	}

	run("docker", [...DOCKER_COMPOSE_ARGS, "up", "-d", "--no-deps", "electric"], {
		SUPERSET_LOCAL_DATABASE_NAME: databaseName,
	});
}

if (args.has("-h") || args.has("--help")) {
	console.log(help);
	process.exit(0);
}

if (process.platform !== "darwin") {
	fail("local desktop development is currently documented for macOS only.");
}

requireCommand("bun", "Install Bun from https://bun.sh.");
if (!args.has("--skip-docker")) {
	requireCommand("docker", "Install Docker Desktop for macOS.");
}
if (!args.has("--skip-caddy-trust")) {
	requireCommand("caddy", "Install Caddy with: brew install caddy");
}

copyIfMissing(".env.example", ".env");
normalizeLocalEnv();

copyIfMissing(
	"apps/electric-proxy/.dev.vars.example",
	"apps/electric-proxy/.dev.vars",
);
copyIfMissing("Caddyfile.example", "Caddyfile");

if (!args.has("--skip-docker")) {
	ensureLocalPostgres();
	ensureLocalDatabase(localDatabaseName);
	ensureLocalElectric(localDatabaseName);
}

if (!args.has("--skip-caddy-trust")) {
	run("caddy", ["trust"]);
}

if (!args.has("--skip-migrate")) {
	run("bun", ["run", "db:migrate"]);
}

console.log(`
Local setup is ready.

Next:
  bun dev

Useful checks after boot:
  curl -fsS http://localhost:4641/api/health
  curl -fsS http://localhost:4641/api/auth/ok

Desktop state for this setup lives in:
  ~/.superset-${localWorkspaceName}

Local database for this worktree:
  ${localDatabaseName}
`);
