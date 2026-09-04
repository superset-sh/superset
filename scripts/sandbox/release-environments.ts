/**
 * Regenerates everything a cloud workspace starts from, deterministically and
 * from outside any sandbox:
 *
 *   1. the base image (`superset-hostsvc`), unless --skip-base
 *   2. the internal golden sandbox: base image + internal-setup.sh, verified
 *      inside (dependencies, turbo, zsh config, gt, Electron libs, display)
 *   3. the environments rows: shared `Default` -> base image, and the internal
 *      organization's environment -> fork of the new golden; the previous
 *      golden is deleted once the row points at the new one
 *
 *   SUPERSET_INTERNAL_ORGANIZATION_ID=… bun run sandbox:release [--production] [--skip-base] [--keep-old]
 *
 * Needs BLAXEL_API_KEY / BLAXEL_WORKSPACE and NEON_API_KEY / NEON_PROJECT_ID
 * (all in the root .env). The rows go to DATABASE_URL, or with --production to
 * the Neon project's default branch, resolved through the Neon API. Fails
 * loudly and leaves the new golden up for inspection if any check fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxInstance, settings } from "@blaxel/core";

// The provisioning code imports the API env schema; an operator running this
// should not need every API secret to exist locally.
process.env.SKIP_ENV_VALIDATION ??= "1";

const ROOT = join(import.meta.dir, "..", "..");
const SKIP_BASE = process.argv.includes("--skip-base");
const KEEP_OLD = process.argv.includes("--keep-old");
// --probe-neon lets the probe branch the database the way a real workspace
// does, and deletes that branch afterwards; the default probe skips it.
const PROBE_NEON = process.argv.includes("--probe-neon");
const PRODUCTION = process.argv.includes("--production");
const IMAGE = "superset-hostsvc";
const REGION = process.env.BLAXEL_REGION ?? "us-pdx-1";
const WORKSPACE = "/workspace";
const INTERNAL_NAME =
	process.env.SUPERSET_INTERNAL_ENVIRONMENT_NAME ?? "Superset";
const ORGANIZATION_ID = process.env.SUPERSET_INTERNAL_ORGANIZATION_ID;
const ENV_FILE = process.env.SUPERSET_INTERNAL_ENV_FILE;

const started = Date.now();
const at = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s`;
const log = (line: string) => console.log(`${at()} ${line}`);
function fail(reason: string): never {
	console.error(`${at()} FAIL ${reason}`);
	process.exit(1);
}

if (!ORGANIZATION_ID) fail("SUPERSET_INTERNAL_ORGANIZATION_ID is required");
if (PRODUCTION) {
	const key = process.env.NEON_API_KEY;
	const project = process.env.NEON_PROJECT_ID;
	if (!key || !project)
		fail("--production needs NEON_API_KEY and NEON_PROJECT_ID");
	const headers = { authorization: `Bearer ${key}` };
	const branchesResponse = await fetch(
		`https://console.neon.tech/api/v2/projects/${project}/branches`,
		{ headers },
	);
	if (!branchesResponse.ok) fail(`Neon branches: ${branchesResponse.status}`);
	const branches = (await branchesResponse.json()) as {
		branches: Array<{ id: string; name: string; default?: boolean }>;
	};
	const main = branches.branches.find((b) => b.default);
	if (!main) fail("no default branch in the Neon project");
	const uriResponse = await fetch(
		`https://console.neon.tech/api/v2/projects/${project}/connection_uri?branch_id=${main.id}&database_name=neondb&role_name=neondb_owner&pooled=false`,
		{ headers },
	);
	if (!uriResponse.ok) fail(`Neon connection_uri: ${uriResponse.status}`);
	const uri = (await uriResponse.json()) as { uri?: string };
	if (!uri.uri) fail("could not resolve the production connection string");
	process.env.DATABASE_URL = uri.uri;
	log(`database: Neon branch ${main.name} (${main.id})`);
} else if (!process.env.DATABASE_URL) {
	fail("DATABASE_URL is required (or pass --production)");
}
settings.setConfig({
	apiKey: process.env.BLAXEL_API_KEY ?? "",
	workspace: process.env.BLAXEL_WORKSPACE ?? "",
});

// 1. base image
if (SKIP_BASE) {
	log("base image: skipped (--skip-base)");
} else {
	log("base image: building host-service bundle");
	const build = Bun.spawnSync(
		["bun", "run", "--cwd", "packages/host-service", "build:host"],
		{ cwd: ROOT, stdout: "ignore", stderr: "inherit" },
	);
	if (build.exitCode !== 0) fail("host-service build failed");
	log(`base image: building and pushing ${IMAGE}`);
	const image = Bun.spawnSync(["bun", "scripts/sandbox/image.ts"], {
		cwd: ROOT,
		env: {
			...process.env,
			BL_API_KEY: process.env.BLAXEL_API_KEY,
			BL_WORKSPACE: process.env.BLAXEL_WORKSPACE,
		},
		stdout: "pipe",
		stderr: "inherit",
	});
	const out = image.stdout.toString();
	if (image.exitCode !== 0 || !out.includes(`built: ${IMAGE}`))
		fail("image build did not report success");
	log(`base image: ${IMAGE} pushed`);
}

// 2. internal golden
const golden = `env-internal-${Date.now().toString(36)}`;
log(`golden: creating ${golden} from ${IMAGE}`);
// No credential routing here on purpose: a fork inherits a source's proxy
// variables as unresolved templates and loses egress entirely. provisioning
// applies the routing to each fork instead, and the probe below checks it.
const sandbox = await SandboxInstance.createIfNotExists({
	name: golden,
	image: IMAGE,
	// The writable root is tmpfs sized at half of memory, and those pages count
	// against the same memory (docs/cloud-sandbox-mismatches.md). A checkout
	// plus node_modules is ~6 GB, and the dev stack (api, web, electron-vite,
	// Electron) needs another ~8 GB, so 16 GB ran out at 15.0/16.0 before
	// Electron was up. Forks inherit this, so every workspace from this golden
	// pays for 32 GB.
	memory: 32768,
	region: REGION,
} as never);
await sandbox
	.wait?.({ maxWait: 300_000, interval: 2000 })
	.catch((error: unknown) =>
		fail(`golden ${golden} never became ready: ${String(error).slice(0, 120)}`),
	);

// The golden never carries variables: in production they arrive as environment
// secrets, injected into each workspace's env. SUPERSET_INTERNAL_ENV_FILE feeds
// only the throwaway probe below, the same way, so the dev-stack checks can run.
const RESERVED_PREFIXES = ["SUPERSET_", "HOST_SERVICE_", "BLAXEL_"];
const RESERVED_KEYS = new Set([
	"ORGANIZATION_ID",
	"AUTH_TOKEN",
	"HOST_DB_PATH",
	"HOST_MIGRATIONS_FOLDER",
	"PORT",
	"NODE_ENV",
	"PATH",
	"HOME",
]);
const probeEnv: Record<string, string> = {};
if (ENV_FILE) {
	for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
		const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
		if (!m) continue;
		const [, key, raw] = m;
		if (
			RESERVED_KEYS.has(key) ||
			RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))
		)
			continue;
		probeEnv[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
	}
	log(
		`probe env: ${Object.keys(probeEnv).length} variables from the env file (reserved names skipped)`,
	);
} else {
	log("no SUPERSET_INTERNAL_ENV_FILE: the probe skips the dev-stack checks");
}

async function run(
	name: string,
	command: string,
): Promise<{ code: number; logs: string }> {
	const result = (await sandbox.process.exec({
		name,
		command: `bash -lc ${JSON.stringify(command)}`,
		waitForCompletion: true,
	} as never)) as { exitCode?: number };
	const logs = String(await sandbox.process.logs(name).catch(() => ""));
	return { code: result.exitCode ?? 0, logs };
}

// A synchronous exec dies at the edge gateway after roughly two minutes
// (504), and the setup takes longer than that once dependencies install. So
// it runs detached and the script polls the process until it finishes.
async function runLong(
	name: string,
	command: string,
	maxMs = 20 * 60_000,
): Promise<{ code: number; logs: string }> {
	await sandbox.process.exec({
		name,
		command: `bash -lc ${JSON.stringify(command)}`,
		waitForCompletion: false,
	} as never);
	const started = Date.now();
	for (;;) {
		await new Promise((resolve) => setTimeout(resolve, 5000));
		const info = (await sandbox.process.get(name).catch(() => null)) as {
			status?: string;
			exitCode?: number;
		} | null;
		if (
			info &&
			["completed", "failed", "stopped", "killed"].includes(info.status ?? "")
		) {
			const logs = String(await sandbox.process.logs(name).catch(() => ""));
			return {
				code: info.exitCode ?? (info.status === "completed" ? 0 : 1),
				logs,
			};
		}
		if (Date.now() - started > maxMs) {
			const logs = String(await sandbox.process.logs(name).catch(() => ""));
			return {
				code: 124,
				logs: `${logs}\n[release] ${name} still running after ${maxMs / 60000} min`,
			};
		}
	}
}

await sandbox.fs.write(
	"/tmp/internal-setup.sh",
	readFileSync(join(import.meta.dir, "internal-setup.sh"), "utf8"),
);
log(
	"golden: running internal-setup.sh (dependency install takes several minutes)",
);
const setup = await runLong(
	"internal-setup",
	`SUPERSET_SANDBOX_WORKSPACE_PATH=${WORKSPACE} bash /tmp/internal-setup.sh`,
);
for (const line of setup.logs
	.split("\n")
	.filter((l) => l.includes("[internal-setup]")))
	log(`  ${line.trim()}`);
if (setup.code !== 0)
	fail(`internal-setup.sh exited ${setup.code}; ${golden} left for inspection`);

// verification, inside the golden: everything internal-setup.sh promises
const checks: Array<[label: string, command: string, expect: RegExp]> = [
	[
		"repo",
		`git -C ${WORKSPACE} remote get-url origin`,
		/superset-sh\/superset/,
	],
	["dependencies", `test -d ${WORKSPACE}/node_modules && echo ok`, /ok/],
	[
		"turbo",
		`cd ${WORKSPACE} && bun x turbo --version 2>/dev/null | tail -1`,
		/^\d+\.\d+\.\d+/m,
	],
	[
		"zsh config",
		`grep -q code/config/zsh/config.zsh ~/.zshrc && zsh -ic 'type gt' 2>/dev/null`,
		/gt is/,
	],
	[
		"electron libs",
		`ldconfig -p | grep -cE 'libgtk-3.so.0|libnss3.so|libgbm.so.1'`,
		/^[3-9]/m,
	],
	["xterm", "command -v xterm", /xterm/],
	["autostart", "test -f ~/.config/openbox/autostart && echo ok", /ok/],
];
let failed = 0;
for (const [label, command, expect] of checks) {
	const { logs } = await run(`check-${label.replace(/\W+/g, "-")}`, command);
	const ok = expect.test(logs);
	log(
		`${ok ? "ok  " : "FAIL"} ${label}: ${logs.trim().split("\n").pop() ?? "(no output)"}`,
	);
	if (!ok) failed++;
}
if (failed) fail(`${failed} check(s) failed; ${golden} left for inspection`);

// verification, as a workspace: fork the golden exactly the way provisioning
// does, then check what a person gets — host-service, the display with its
// terminal, VNC, and (with a .env) the dev stack and the Electron desktop.
const { provisionSandbox, mintPreviewAccess, deleteSandbox } = await import(
	"../../packages/trpc/src/lib/blaxel/index.ts"
);
const { SANDBOX_HOST_DB_PATH } = await import(
	"../../packages/shared/src/constants.ts"
);
const probe = `ws-release-probe-${Date.now().toString(36)}`;
const probeWorkspaceId = crypto.randomUUID();
const probeBranch = `cloud-${probeWorkspaceId.split("-")[0]}`;
log(`probe: provisioning ${probe} as a fork of ${golden}`);
await provisionSandbox({
	name: probe,
	environment: {
		sourceKind: "fork",
		sourceRef: golden,
	},
	workspaceEnv: {
		...probeEnv,
		ORGANIZATION_ID: ORGANIZATION_ID,
		HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
		HOST_MIGRATIONS_FOLDER: "/app/drizzle",
		AUTH_TOKEN: "sandbox",
		SUPERSET_API_URL:
			process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
		SUPERSET_HOST_RUN_MODE: "sandbox",
		SUPERSET_SANDBOX_WORKSPACE_ID: probeWorkspaceId,
		SUPERSET_SANDBOX_WORKSPACE_NAME: "release-probe",
		// A real workspace branches the database for itself at first boot; a
		// probe must not leave a Neon branch behind unless asked to prove it.
		...(PROBE_NEON ? {} : { SUPERSET_RELEASE_PROBE: "1" }),
		SUPERSET_SANDBOX_BRANCH: "main",
		SUPERSET_SANDBOX_WORKSPACE_PATH: WORKSPACE,
		SUPERSET_SANDBOX_REPO_URL: "https://github.com/superset-sh/superset.git",
		SUPERSET_SANDBOX_IMAGE_TAG: golden,
	},
});
const access = await mintPreviewAccess(probe);
const forked = await SandboxInstance.get(probe);
// The edge drops the odd HTTP/2 session (GOAWAY, 502/504) under a long
// poll; a check is idempotent, so retry it rather than fail the release.
async function probeRun(name: string, command: string): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		try {
			await forked.process.exec({
				name: `${name}-${attempt}`,
				command: `bash -lc ${JSON.stringify(command)}`,
				waitForCompletion: true,
			} as never);
			return String(
				await forked.process.logs(`${name}-${attempt}`).catch(() => ""),
			);
		} catch (error) {
			if (attempt >= 4) throw error;
			log(
				`  probe exec ${name} retry ${attempt}: ${String((error as Error).message ?? error).slice(0, 80)}`,
			);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
}
async function until(
	label: string,
	command: string,
	expect: RegExp,
	seconds: number,
): Promise<boolean> {
	for (let i = 0; i < seconds / 5; i++) {
		const out = await probeRun(`${label}-${i}`, command);
		if (expect.test(out)) {
			log(`ok   ${label}: ${out.trim().split("\n").pop()}`);
			return true;
		}
		await new Promise((r) => setTimeout(r, 5000));
	}
	log(`FAIL ${label}`);
	return false;
}
let probeFailed = 0;
let health = 0;
for (let i = 0; i < 40 && health !== 200; i++) {
	health = await fetch(`${access.url}/trpc/health.check`, {
		headers: {
			"X-Blaxel-Preview-Token": access.token,
			authorization: "Bearer sandbox",
		},
	})
		.then((r) => r.status)
		.catch(() => 0);
	if (health !== 200) await new Promise((r) => setTimeout(r, 3000));
}
log(`${health === 200 ? "ok  " : "FAIL"} host-service: ${health}`);
if (health !== 200) probeFailed++;
if (
	!(await until(
		"dependencies survive the fork",
		`test -d ${WORKSPACE}/node_modules && echo ok`,
		/ok/,
		10,
	))
)
	probeFailed++;
if (
	!(await until(
		"display + xterm",
		"pgrep -x Xvfb >/dev/null && pgrep -x x11vnc >/dev/null && pgrep -x xterm >/dev/null && echo up",
		/up/,
		60,
	))
)
	probeFailed++;
const vnc = new URL("/desktop/vnc", access.url);
vnc.protocol = "wss:";
vnc.searchParams.set("bl_preview_token", access.token);
vnc.searchParams.set("token", "sandbox");
const frame = await new Promise<string>((resolve) => {
	const ws = new WebSocket(vnc.toString());
	ws.binaryType = "arraybuffer";
	const t = setTimeout(() => {
		resolve("timeout");
		ws.close();
	}, 30000);
	ws.onmessage = (e) => {
		clearTimeout(t);
		resolve(
			new TextDecoder().decode(
				new Uint8Array(e.data as ArrayBuffer).slice(0, 12),
			),
		);
		ws.close();
	};
	ws.onerror = () => {
		clearTimeout(t);
		resolve("error");
	};
});
log(
	`${frame.startsWith("RFB ") ? "ok  " : "FAIL"} vnc: ${JSON.stringify(frame)}`,
);
if (!frame.startsWith("RFB ")) probeFailed++;
if (ENV_FILE) {
	if (
		!(await until(
			"dev stack (api on :3001)",
			"curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/auth/get-session",
			/200/,
			420,
		))
	)
		probeFailed++;
	if (PROBE_NEON) {
		const stamp = await probeRun(
			"db-branch",
			"cat /data/.superset-db-branch 2>/dev/null; tail -n 3 /tmp/superset-workspace-db.log 2>/dev/null",
		);
		const ok = stamp.includes(probeBranch);
		log(
			`${ok ? "ok  " : "FAIL"} database branch: ${stamp.trim().split("\n").pop() ?? "(no output)"}`,
		);
		if (!ok) probeFailed++;
	}
	{
		const status = await probeRun(
			"agent-credentials",
			"curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H \"x-api-key: $ANTHROPIC_API_KEY\" -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models" +
				"; echo; curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H \"Authorization: Bearer $OPENAI_API_KEY\" https://api.openai.com/v1/models",
		);
		const codes = status.trim().split(/\s+/);
		const ok = codes.length === 2 && codes.every((code) => code === "200");
		log(
			`${ok ? "ok  " : "FAIL"} agent credentials (Anthropic, OpenAI; keys from the env file): ${codes.join(" ") || "(no output)"}`,
		);
		if (!ok) probeFailed++;
	}
	if (
		!(await until(
			"electron desktop on the display",
			"pgrep -x electron >/dev/null && echo up",
			/up/,
			300,
		))
	) {
		probeFailed++;
		const logs = await probeRun(
			"desktop-log",
			"tail -n 15 /tmp/superset-desktop.log 2>/dev/null | sed 's/\\x1b\\[[0-9;?]*[A-Za-z]//g' | cut -c1-200",
		);
		for (const line of logs.trim().split("\n")) log(`  [desktop] ${line}`);
	}
}
if (probeFailed)
	fail(
		`${probeFailed} probe check(s) failed; ${golden} and ${probe} left for inspection`,
	);
await deleteSandbox(probe);
log(`probe: ${probe} deleted`);
if (PROBE_NEON && probeEnv.NEON_PROJECT_ID) {
	const del = Bun.spawnSync(
		[
			"neonctl",
			"branches",
			"delete",
			probeBranch,
			"--project-id",
			probeEnv.NEON_PROJECT_ID,
		],
		{
			env: { ...process.env, NEON_API_KEY: probeEnv.NEON_API_KEY ?? "" },
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	log(
		del.exitCode === 0
			? `probe: Neon branch ${probeBranch} deleted`
			: `probe: Neon branch ${probeBranch} NOT deleted: ${new TextDecoder().decode(del.stderr).trim().slice(0, 120)}`,
	);
}

// 3. environments rows
const { db } = await import("../../packages/db/src/client.ts");
const { environments, organizations } = await import(
	"../../packages/db/src/schema/index.ts"
);
const {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} = await import("../../packages/shared/src/constants.ts");

await db
	.insert(organizations)
	.values({
		id: SHARED_ENVIRONMENT_ORGANIZATION_ID,
		name: "Superset",
		slug: "superset-shared-environments",
	})
	.onConflictDoNothing({ target: organizations.id });
await db
	.insert(environments)
	.values({
		organizationId: SHARED_ENVIRONMENT_ORGANIZATION_ID,
		name: SHARED_ENVIRONMENT_NAME,
		provider: "blaxel",
		sourceKind: "image",
		sourceRef: SANDBOX_IMAGE_NAME,
	})
	.onConflictDoUpdate({
		target: [environments.organizationId, environments.name],
		set: { sourceRef: SANDBOX_IMAGE_NAME, archivedAt: null },
	});
log(`rows: ${SHARED_ENVIRONMENT_NAME} -> image ${SANDBOX_IMAGE_NAME}`);

const previous = await db.query.environments.findFirst({
	where: (row, { and, eq }) =>
		and(eq(row.organizationId, ORGANIZATION_ID), eq(row.name, INTERNAL_NAME)),
});
await db
	.insert(environments)
	.values({
		organizationId: ORGANIZATION_ID,
		name: INTERNAL_NAME,
		provider: "blaxel",
		sourceKind: "fork",
		sourceRef: golden,
	})
	.onConflictDoUpdate({
		target: [environments.organizationId, environments.name],
		set: { sourceKind: "fork", sourceRef: golden, archivedAt: null },
	});
log(
	`rows: ${INTERNAL_NAME} (organization ${ORGANIZATION_ID}) -> fork ${golden}`,
);

if (previous?.sourceKind === "fork" && previous.sourceRef !== golden) {
	if (KEEP_OLD) log(`previous golden ${previous.sourceRef} kept (--keep-old)`);
	else {
		try {
			await SandboxInstance.delete(previous.sourceRef);
			log(`previous golden ${previous.sourceRef} deleted`);
		} catch (error) {
			log(
				`previous golden ${previous.sourceRef} not deleted: ${String(error).slice(0, 120)}`,
			);
		}
	}
}
log(`done: ${golden}`);
process.exit(0);
