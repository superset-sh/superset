/**
 * Regenerates everything a cloud workspace starts from, deterministically and
 * from outside any sandbox:
 *
 *   1. the base image (`superset-hostsvc`) in Vercel Container Registry,
 *      unless --skip-base
 *   2. the internal golden sandbox: base image + internal-setup.sh, verified
 *      inside (dependencies, turbo, zsh config, gt, Electron libs, display),
 *      then stopped so its snapshot is what forks start from
 *   3. the environments rows: shared `Default` -> base image, and the internal
 *      organization's environment -> fork of the new golden; the previous
 *      golden is deleted once the row points at the new one
 *
 *   SUPERSET_INTERNAL_ORGANIZATION_ID=… bun run sandbox:release [--production] [--skip-base] [--keep-old]
 *
 * Needs the VERCEL_SANDBOX_* variables and SANDBOX_GATE_SECRET, plus
 * NEON_API_KEY / NEON_PROJECT_ID (all in the root .env) and, for the image, a
 * Docker daemon and `vercel vcr login docker`. The rows go to DATABASE_URL, or
 * with --production to the Neon project's default branch, resolved through the
 * Neon API. Fails loudly and leaves the new golden up for inspection if any
 * check fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APIError, Sandbox } from "@vercel/sandbox";

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
const HOST_SERVICE_PORT = 4879;
const WORKSPACE = "/workspace";
const INTERNAL_NAME =
	process.env.SUPERSET_INTERNAL_ENVIRONMENT_NAME ?? "Superset";
const ORGANIZATION_ID = process.env.SUPERSET_INTERNAL_ORGANIZATION_ID;
const ENV_FILE = process.env.SUPERSET_INTERNAL_ENV_FILE;
/**
 * Disk is 64 GB regardless; this is memory (2 GB per vCPU) for the dev stack —
 * api, web, electron-vite, Electron — which needs around 8 GB on top of the
 * checkout's tooling. Forks inherit it.
 */
const GOLDEN_VCPUS = 8;
const GOLDEN_SESSION_TIMEOUT_MS = 60 * 60 * 1000;

const started = Date.now();
const at = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s`;
const log = (line: string) => console.log(`${at()} ${line}`);
function fail(reason: string): never {
	console.error(`${at()} FAIL ${reason}`);
	process.exit(1);
}

if (!ORGANIZATION_ID) fail("SUPERSET_INTERNAL_ORGANIZATION_ID is required");
const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
if (!credentials.token || !credentials.teamId || !credentials.projectId) {
	fail(
		"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID are required",
	);
}
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

// 1. base image
if (SKIP_BASE) {
	log("base image: skipped (--skip-base)");
} else {
	log("base image: building host-service and pty-daemon bundles");
	for (const [pkg, script] of [
		["packages/host-service", "build:host"],
		["packages/pty-daemon", "build:daemon"],
	]) {
		const build = Bun.spawnSync(["bun", "run", "--cwd", pkg, script], {
			cwd: ROOT,
			stdout: "ignore",
			stderr: "inherit",
		});
		if (build.exitCode !== 0) fail(`${pkg} build failed`);
	}
	log(`base image: building and pushing ${IMAGE}`);
	const image = Bun.spawnSync(["bun", "scripts/sandbox/image.ts"], {
		cwd: ROOT,
		env: process.env,
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
// A freshly pushed image sits in `Preparing` while the registry optimises it
// for sandboxes (a few minutes for a gigabyte), and create answers 409
// `image_not_ready` until then. Waiting here is what makes a release one
// command rather than two runs.
async function createGolden(): Promise<Sandbox> {
	const deadline = Date.now() + 20 * 60_000;
	for (;;) {
		try {
			return await Sandbox.create({
				...credentials,
				name: golden,
				image: IMAGE,
				resources: { vcpus: GOLDEN_VCPUS },
				timeout: GOLDEN_SESSION_TIMEOUT_MS,
				ports: [HOST_SERVICE_PORT],
				region: (process.env.VERCEL_SANDBOX_REGION ?? "iad1") as never,
				persistent: true,
				// Goldens are kept until the environment that points at them goes.
				snapshotExpiration: 0,
				keepLastSnapshots: { count: 1 },
				tags: { kind: "environment" },
			});
		} catch (error) {
			const notReady =
				error instanceof APIError && error.response.status === 409;
			if (!notReady || Date.now() > deadline) {
				fail(
					`golden ${golden} could not be created: ${String(error).slice(0, 200)}`,
				);
			}
			log("golden: image still preparing in the registry, waiting");
			await new Promise((resolve) => setTimeout(resolve, 15_000));
		}
	}
}
const sandbox = await createGolden();

// The golden never carries variables: in production they arrive as environment
// secrets, injected into each workspace's env. SUPERSET_INTERNAL_ENV_FILE feeds
// only the throwaway probe below, the same way, so the dev-stack checks can run.
const RESERVED_PREFIXES = ["SUPERSET_", "HOST_SERVICE_", "VERCEL_"];
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
	target: Sandbox,
	command: string,
): Promise<{ code: number; logs: string }> {
	const result = await target.runCommand("bash", ["-lc", command]);
	return {
		code: result.exitCode,
		logs: `${await result.stdout()}${await result.stderr()}`,
	};
}

// Detached with a wait rather than one long request: the setup takes longer
// than any single HTTP call should be held open for.
async function runLong(
	target: Sandbox,
	command: string,
	maxMs = 20 * 60_000,
): Promise<{ code: number; logs: string }> {
	const detached = await target.runCommand({
		cmd: "bash",
		args: ["-lc", command],
		detached: true,
		timeoutMs: maxMs,
	});
	const result = await detached.wait();
	return {
		code: result.exitCode,
		logs: `${await result.stdout()}${await result.stderr()}`,
	};
}

await sandbox.writeFiles([
	{
		path: "/tmp/internal-setup.sh",
		content: readFileSync(join(import.meta.dir, "internal-setup.sh")),
	},
]);
log(
	"golden: running internal-setup.sh (dependency install takes several minutes)",
);
const setup = await runLong(
	sandbox,
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
	[
		"dev stack autostart",
		"test -f ~/.config/autostart/superset-dev-stack.desktop && test -x /usr/local/bin/superset-dev-stack && echo ok",
		/ok/,
	],
];
let failed = 0;
for (const [label, command, expect] of checks) {
	const { logs } = await run(sandbox, command);
	const ok = expect.test(logs);
	log(
		`${ok ? "ok  " : "FAIL"} ${label}: ${logs.trim().split("\n").pop() ?? "(no output)"}`,
	);
	if (!ok) failed++;
}
if (failed) fail(`${failed} check(s) failed; ${golden} left for inspection`);

const {
	provisionSandbox,
	resolveSandboxAddress,
	sandboxHostSecretFor,
	deleteSandbox,
	waitForStopSnapshot,
} = await import("../../packages/trpc/src/lib/sandbox/index.ts");

// The stop is the snapshot forks start from; a running golden has none, and
// a fork taken before that snapshot is current boots from the bare image.
const beforeStop = sandbox.currentSnapshotId;
await sandbox.stop();
await waitForStopSnapshot(golden, beforeStop);
log(`golden: ${golden} stopped and snapshotted`);

// verification, as a workspace: fork the golden exactly the way provisioning
// does, then check what a person gets — host-service, the display with its
// terminal, VNC, and (with a .env) the dev stack and the Electron desktop.
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
	environmentEnv: probeEnv,
	workspaceEnv: {
		ORGANIZATION_ID: ORGANIZATION_ID,
		HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
		HOST_MIGRATIONS_FOLDER: "/app/drizzle",
		AUTH_TOKEN: "sandbox",
		SUPERSET_API_URL:
			process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
		SUPERSET_HOST_RUN_MODE: "sandbox",
		SUPERSET_SANDBOX_WORKSPACE_ID: probeWorkspaceId,
		HOST_SERVICE_SECRET: await sandboxHostSecretFor(probeWorkspaceId),
		SUPERSET_SANDBOX_WORKSPACE_NAME: "release-probe",
		// A real workspace branches the database for itself at first boot; a
		// probe must not leave a Neon branch behind unless asked to prove it.
		...(PROBE_NEON ? {} : { SUPERSET_RELEASE_PROBE: "1" }),
		SUPERSET_SANDBOX_BRANCH: "main",
		SUPERSET_SANDBOX_WORKSPACE_PATH: WORKSPACE,
		SUPERSET_SANDBOX_REPO_URL: "https://github.com/superset-sh/superset.git",
		SUPERSET_SANDBOX_IMAGE_TAG: golden,
		SUPERSET_SANDBOX_PROVIDER: "vercel",
	},
});
const { target: probeUrl } = await resolveSandboxAddress({
	providerSandboxId: probe,
	wake: false,
});
const probeToken = await sandboxHostSecretFor(probeWorkspaceId);
const forked = await Sandbox.get({ ...credentials, name: probe });
async function probeRun(command: string): Promise<string> {
	return (await run(forked, command)).logs;
}
async function until(
	label: string,
	command: string,
	expect: RegExp,
	seconds: number,
): Promise<boolean> {
	for (let i = 0; i < seconds / 5; i++) {
		const out = await probeRun(command);
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
	health = await fetch(`${probeUrl}/trpc/health.check`, {
		headers: { authorization: `Bearer ${probeToken}` },
	})
		.then((r) => r.status)
		.catch(() => 0);
	if (health !== 200) await new Promise((r) => setTimeout(r, 3000));
}
log(`${health === 200 ? "ok  " : "FAIL"} host-service: ${health}`);
if (health !== 200) probeFailed++;
{
	// health.check is public on purpose; the gate is probed on a guarded route.
	const anonymous = await fetch(`${probeUrl}/events`)
		.then((r) => r.status)
		.catch(() => 0);
	log(`${anonymous === 401 ? "ok  " : "FAIL"} no token refused: ${anonymous}`);
	if (anonymous !== 401) probeFailed++;
}
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
		"display + xfce + plank",
		"pgrep -x Xvnc >/dev/null && pgrep -x xfce4-session >/dev/null && pgrep -x plank >/dev/null && echo up",
		/up/,
		60,
	))
)
	probeFailed++;
const vnc = new URL("/desktop/vnc", probeUrl);
vnc.protocol = "wss:";
vnc.searchParams.set("token", probeToken);
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
			"curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H \"x-api-key: $ANTHROPIC_API_KEY\" -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models" +
				"; echo; curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H \"Authorization: Bearer $OPENAI_API_KEY\" https://api.openai.com/v1/models",
		);
		const codes = status.trim().split(/\s+/);
		const ok = codes.length === 2 && codes.every((code) => code === "200");
		log(
			`${ok ? "ok  " : "FAIL"} agent credentials (Anthropic, OpenAI; keys from the env file or brokered): ${codes.join(" ") || "(no output)"}`,
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
		provider: "vercel",
		sourceKind: "image",
		sourceRef: SANDBOX_IMAGE_NAME,
	})
	.onConflictDoUpdate({
		target: [environments.organizationId, environments.name],
		set: {
			provider: "vercel",
			sourceRef: SANDBOX_IMAGE_NAME,
			archivedAt: null,
		},
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
		provider: "vercel",
		sourceKind: "fork",
		sourceRef: golden,
	})
	.onConflictDoUpdate({
		target: [environments.organizationId, environments.name],
		set: {
			provider: "vercel",
			sourceKind: "fork",
			sourceRef: golden,
			archivedAt: null,
		},
	});
log(
	`rows: ${INTERNAL_NAME} (organization ${ORGANIZATION_ID}) -> fork ${golden}`,
);

if (
	previous?.sourceKind === "fork" &&
	previous.sourceRef !== golden &&
	previous.provider === "vercel"
) {
	if (KEEP_OLD) log(`previous golden ${previous.sourceRef} kept (--keep-old)`);
	else {
		try {
			await deleteSandbox(previous.sourceRef);
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
