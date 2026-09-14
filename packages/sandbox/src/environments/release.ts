/**
 * Regenerates everything a cloud workspace starts from, from outside any
 * sandbox, and writes the environment rows only once a probe has used the
 * result the way a person would:
 *
 *   1. the host-service runtime asset (this checkout's host-service and
 *      pty-daemon, natives installed for the box) and the bundle, published
 *   2. the image in Vercel Container Registry, unless --skip-image
 *   3. the internal golden: a box provisioned from the image exactly the way
 *      a workspace is, with the internal environment's setup hook run in it,
 *      verified, stripped of its identity and stopped so its snapshot is what
 *      forks start from
 *   4. a probe fork of that golden, checked as a workspace: host-service,
 *      the desktop stream, the checkout, the firewall, the gate
 *   5. the rows: the shared `Default` environment -> image + bundle, the
 *      internal organization's environment -> the new golden + bundle + the
 *      setup and start overrides; the previous golden deleted
 *
 *   SUPERSET_INTERNAL_ORGANIZATION_ID=… bun run release [--production] [--skip-image] [--keep-old]
 *
 * Needs VERCEL_SANDBOX_*, SANDBOX_GATE_SECRET, CDN_R2_* and, for the image,
 * Docker and `vercel vcr login docker`. Rows go to DATABASE_URL, or with
 * --production to the Neon project's default branch (NEON_API_KEY,
 * NEON_PROJECT_ID). SUPERSET_INTERNAL_ENV_FILE feeds the probe's managed
 * environment so the dev-stack checks can run; the golden never carries it.
 * Fails loudly and leaves the golden and probe up for inspection when any
 * check fails; the previous rows stay live.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "@superset/shared/constants";
import {
	SANDBOX_CONTRACT_VERSION,
	SANDBOX_PATHS,
	SANDBOX_ROOT_CHECKOUT,
	type SandboxIdentity,
	sandboxCheckoutDir,
} from "@superset/shared/sandbox-contract";
import { Sandbox } from "@vercel/sandbox";

// The provisioning code imports the API env schema; an operator running this
// should not need every API secret to exist locally.
process.env.SKIP_ENV_VALIDATION ??= "1";

const SKIP_IMAGE = process.argv.includes("--skip-image");
const KEEP_OLD = process.argv.includes("--keep-old");
const PRODUCTION = process.argv.includes("--production");
const INTERNAL_NAME =
	process.env.SUPERSET_INTERNAL_ENVIRONMENT_NAME ?? "Superset";
const ORGANIZATION_ID = process.env.SUPERSET_INTERNAL_ORGANIZATION_ID;
const ENV_FILE = process.env.SUPERSET_INTERNAL_ENV_FILE;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const REPO_URL = "https://github.com/superset-sh/superset.git";
const REPO_PATH = SANDBOX_ROOT_CHECKOUT;
const REPO_DIR = sandboxCheckoutDir(SANDBOX_PATHS.workspace, REPO_PATH);
const REPO_FULL_NAME = "superset-sh/superset";
const BRANCH = "main";

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
if (!process.env.SANDBOX_GATE_SECRET)
	fail("SANDBOX_GATE_SECRET is required (the host secret derives from it)");
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
	process.env.DATABASE_URL_UNPOOLED = uri.uri;
	log(`database: Neon branch ${main.name} (${main.id})`);
} else if (!process.env.DATABASE_URL) {
	fail("DATABASE_URL is required (or pass --production)");
}

// 1. runtime asset and bundle
const { producers } = await import("../assets/produce");
const { buildBundle, publishBundle } = await import("../build");
log("runtime: building host-service and pty-daemon into the runtime asset");
await producers["host-service"]?.();
const bundle = buildBundle();
await publishBundle(bundle, { dry: false });
log(`bundle: ${bundle.sha256} published`);

// 2. image
if (SKIP_IMAGE) {
	log("image: skipped (--skip-image)");
} else {
	const { buildImage } = await import("../image");
	log(`image: building and pushing ${SANDBOX_IMAGE_NAME}`);
	buildImage(bundle, { local: false });
}

// 3. golden
const {
	deleteSandbox,
	deriveSandboxCredentials,
	provisionSandbox,
	sandboxHostSecretFor,
	stopAndSnapshot,
	stripWorkspaceIdentity,
	wakeSandbox,
} = await import("@superset/trpc/lib/sandbox");
const { probeBox, checkWakeLog } = await import("./probe");

const setupScript = readFileSync(
	join(import.meta.dir, "internal-setup.sh"),
	"utf8",
);
const hooks = { setup: [setupScript], start: ["superset-dev-stack"] };

function identityFor(workspaceId: string, sourceRef: string): SandboxIdentity {
	return {
		SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
		SUPERSET_BUNDLE_SHA: bundle.sha256,
		SUPERSET_API_URL: API_URL,
		SUPERSET_SANDBOX_WORKSPACE_ID: workspaceId,
		SUPERSET_SANDBOX_ORGANIZATION_ID: ORGANIZATION_ID as string,
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
			{ url: REPO_URL, branch: BRANCH, path: REPO_PATH, hooks: true },
		]),
		SUPERSET_SANDBOX_IMAGE_TAG: sourceRef,
		SUPERSET_SANDBOX_PROVIDER: "vercel",
		SUPERSET_SANDBOX_HOOKS: JSON.stringify(hooks),
	};
}

const golden = `env-internal-${Date.now().toString(36)}`;
const goldenWorkspaceId = randomUUID();
const goldenSecret = await sandboxHostSecretFor(goldenWorkspaceId);
log(`golden: provisioning ${golden} from ${SANDBOX_IMAGE_NAME}`);
// A freshly pushed image sits in `Preparing` while the registry optimises it
// for sandboxes, and create answers 409 until then.
const deadline = Date.now() + 20 * 60_000;
for (;;) {
	try {
		await provisionSandbox({
			name: golden,
			kind: "environment",
			environment: { sourceKind: "image", sourceRef: SANDBOX_IMAGE_NAME },
			claim: {
				identity: identityFor(goldenWorkspaceId, SANDBOX_IMAGE_NAME),
				hostSecret: goldenSecret,
				managedEnv: {},
				networkPolicy: "allow-all",
			},
		});
		break;
	} catch (error) {
		const notReady =
			String(error).includes("409") ||
			String(error).includes("image_not_ready");
		if (!notReady || Date.now() > deadline)
			fail(
				`golden ${golden} could not be created: ${String(error).slice(0, 200)}`,
			);
		log("golden: image still preparing in the registry, waiting");
		await new Promise((resolve) => setTimeout(resolve, 15_000));
	}
}
await wakeSandbox({
	providerSandboxId: golden,
	claim: {
		identity: identityFor(goldenWorkspaceId, SANDBOX_IMAGE_NAME),
		hostSecret: goldenSecret,
		managedEnv: {},
		networkPolicy: "allow-all",
	},
});
log("golden: host-service up; waiting for the checkout");
const goldenBox = await Sandbox.get({ ...credentials, name: golden });
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
	maxMs = 25 * 60_000,
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
{
	const checkout = await run(
		goldenBox,
		`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 1; done; echo missing`,
	);
	if (!/ready/.test(checkout.logs))
		fail(
			`golden: the checkout never reported ready; ${golden} left for inspection`,
		);
}
log(
	"golden: running the setup hook (dependency install takes several minutes)",
);
const setup = await runLong(
	goldenBox,
	`cd ${REPO_DIR} && ${hooks.setup.join(" && ")}`,
);
for (const line of setup.logs
	.split("\n")
	.filter((l) => l.includes("[internal-setup]")))
	log(`  ${line.trim()}`);
if (setup.code !== 0)
	fail(`setup hook exited ${setup.code}; ${golden} left for inspection`);

const checks: Array<[label: string, command: string, expect: RegExp]> = [
	["repo", `git -C ${REPO_DIR} remote get-url origin`, /superset-sh\/superset/],
	["dependencies", `test -d ${REPO_DIR}/node_modules && echo ok`, /ok/],
	[
		"turbo",
		`cd ${REPO_DIR} && bun x turbo --version 2>/dev/null | tail -1`,
		/^\d+\.\d+\.\d+/m,
	],
	[
		"zsh config",
		`grep -q code/config/zsh/config.zsh ~/.zshrc && zsh -ic 'type gt' 2>/dev/null`,
		/gt is/,
	],
	[
		"dev stack start hook",
		"test -x /usr/local/bin/superset-dev-stack && test -x /usr/local/bin/superset-workspace-db && echo ok",
		/ok/,
	],
	["neonctl", "neonctl --version", /^\d+\.\d+/m],
];
let failed = 0;
for (const [label, command, expect] of checks) {
	const { logs } = await run(goldenBox, command);
	const ok = expect.test(logs);
	log(
		`${ok ? "ok  " : "FAIL"} ${label}: ${logs.trim().split("\n").pop() ?? "(no output)"}`,
	);
	if (!ok) failed++;
}
if (failed) fail(`${failed} check(s) failed; ${golden} left for inspection`);

// A fork must not come up as the golden's workspace; and the stop is the
// snapshot forks start from.
await stripWorkspaceIdentity(goldenBox);
await stopAndSnapshot(golden);
log(`golden: ${golden} stripped, stopped and snapshotted`);

// 4. probe, as a workspace
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
		const key = m[1] as string;
		if (
			RESERVED_KEYS.has(key) ||
			RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))
		)
			continue;
		probeEnv[key] = (m[2] as string)
			.replace(/^"(.*)"$/, "$1")
			.replace(/^'(.*)'$/, "$1");
	}
	// A real workspace branches the database for itself at first start; a
	// probe must not leave a Neon branch behind.
	probeEnv.SUPERSET_RELEASE_PROBE = "1";
	log(
		`probe env: ${Object.keys(probeEnv).length} variables from the env file (reserved names skipped)`,
	);
} else {
	log("no SUPERSET_INTERNAL_ENV_FILE: the probe skips the dev-stack checks");
}
const probe = `ws-release-probe-${Date.now().toString(36)}`;
const probeWorkspaceId = randomUUID();
const probeSecret = await sandboxHostSecretFor(probeWorkspaceId);
const { networkPolicy, managedEnv } = deriveSandboxCredentials({
	environmentEnv: probeEnv,
	userAgentEnv: {},
	githubToken: null,
});
const probeClaim = {
	identity: identityFor(probeWorkspaceId, golden),
	hostSecret: probeSecret,
	managedEnv,
	networkPolicy,
};
log(`probe: provisioning ${probe} as a fork of ${golden}`);
await provisionSandbox({
	name: probe,
	environment: { sourceKind: "fork", sourceRef: golden },
	claim: probeClaim,
});
await wakeSandbox({ providerSandboxId: probe, claim: probeClaim });
let probeFailed = await probeBox({
	name: probe,
	credentials,
	hostSecret: probeSecret,
	bundleSha: bundle.sha256,
	branch: BRANCH,
	primaryPath: REPO_PATH,
	expectDependencies: true,
	expectAnthropicRule: Boolean(probeEnv.ANTHROPIC_API_KEY),
	gate: process.env.SANDBOX_GATE_ORIGIN
		? { workspaceId: probeWorkspaceId, userId: randomUUID() }
		: null,
	log,
});
if (ENV_FILE) {
	const probeBox2 = await Sandbox.get({ ...credentials, name: probe });
	// The stack listens where the env file says a laptop's would.
	const apiPort = probeEnv.API_PORT || "3001";
	let up = false;
	for (let i = 0; i < 84 && !up; i++) {
		const { logs } = await run(
			probeBox2,
			`curl -s -o /dev/null -w '%{http_code}' http://localhost:${apiPort}/api/auth/get-session`,
		);
		up = /200/.test(logs);
		if (!up) await new Promise((r) => setTimeout(r, 5000));
	}
	log(
		`${up ? "ok  " : "FAIL"} dev stack (api on :${apiPort}) from the start hook`,
	);
	if (!up) {
		probeFailed++;
		const { logs } = await run(
			probeBox2,
			"tail -n 20 /var/log/superset/start-hook.log /var/log/superset/dev-stack.log 2>/dev/null | cut -c1-200",
		);
		for (const line of logs.trim().split("\n")) log(`  [dev-stack] ${line}`);
	}
}
// The second boot: stop the probe and wake it, the way a person reopening
// a workspace does.
{
	const box = await Sandbox.get({ ...credentials, name: probe });
	await box.stop();
	await wakeSandbox({ providerSandboxId: probe, claim: probeClaim });
	probeFailed += await checkWakeLog({ name: probe, credentials, log });
}
if (probeFailed)
	fail(
		`${probeFailed} probe check(s) failed; ${golden} and ${probe} left for inspection`,
	);
await deleteSandbox(probe);
log(`probe: ${probe} deleted`);

// 5. rows
const { db } = await import("@superset/db/client");
const { environments } = await import("@superset/db/schema");
const { eq } = await import("drizzle-orm");
const { seedSharedEnvironments } = await import("./seed");
await seedSharedEnvironments(SANDBOX_IMAGE_NAME);
await db
	.update(environments)
	.set({ bundleSha: bundle.sha256 })
	.where(eq(environments.organizationId, SHARED_ENVIRONMENT_ORGANIZATION_ID));
log(
	`rows: ${SHARED_ENVIRONMENT_NAME} -> image ${SANDBOX_IMAGE_NAME}, bundle ${bundle.sha256.slice(0, 12)}`,
);

const previous = await db.query.environments.findFirst({
	where: (row, { and, eq: equals }) =>
		and(
			equals(row.organizationId, ORGANIZATION_ID as string),
			equals(row.name, INTERNAL_NAME),
		),
});
await db
	.insert(environments)
	.values({
		organizationId: ORGANIZATION_ID as string,
		name: INTERNAL_NAME,
		provider: "vercel",
		sourceKind: "fork",
		sourceRef: golden,
		bundleSha: bundle.sha256,
		hooks,
	})
	.onConflictDoUpdate({
		target: [environments.organizationId, environments.name],
		set: {
			provider: "vercel",
			sourceKind: "fork",
			sourceRef: golden,
			bundleSha: bundle.sha256,
			hooks,
			archivedAt: null,
		},
	});
// The golden baked the monorepo at its path; a fork asks for the same, and
// the box acts on the monorepo's own .superset/config.json.
const { environmentRepositories, githubRepositories } = await import(
	"@superset/db/schema"
);
const { and: andWhere } = await import("drizzle-orm");
const internal = await db.query.environments.findFirst({
	where: (row, { and: both, eq: equals }) =>
		both(
			equals(row.organizationId, ORGANIZATION_ID as string),
			equals(row.name, INTERNAL_NAME),
		),
});
const monorepo = await db.query.githubRepositories.findFirst({
	where: andWhere(
		eq(githubRepositories.organizationId, ORGANIZATION_ID as string),
		eq(githubRepositories.fullName, REPO_FULL_NAME),
	),
});
if (!internal) fail(`rows: ${INTERNAL_NAME} row missing after upsert`);
if (!monorepo)
	fail(
		`rows: ${REPO_FULL_NAME} is not connected to organization ${ORGANIZATION_ID}; install the GitHub App there first`,
	);
await db
	.delete(environmentRepositories)
	.where(eq(environmentRepositories.environmentId, internal.id));
await db.insert(environmentRepositories).values({
	environmentId: internal.id,
	repositoryId: monorepo.id,
});
await db
	.update(environments)
	.set({ hooksRepositoryId: monorepo.id })
	.where(eq(environments.id, internal.id));
log(
	`rows: ${INTERNAL_NAME} -> fork of ${golden}, bundle ${bundle.sha256.slice(0, 12)}`,
);

if (
	previous &&
	previous.sourceKind === "fork" &&
	previous.sourceRef !== golden
) {
	if (KEEP_OLD) {
		log(`previous golden ${previous.sourceRef} kept (--keep-old)`);
	} else {
		await deleteSandbox(previous.sourceRef);
		log(`previous golden ${previous.sourceRef} deleted`);
	}
}
log("release done");
process.exit(0);
