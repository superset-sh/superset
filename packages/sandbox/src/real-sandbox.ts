/**
 * The dispatch job: boots one real dev-project sandbox from the registry
 * image on this checkout's bundle and checks it the way a person would, then
 * stops and wakes it to check the second boot. No database: the claim is
 * built here from a throwaway identity.
 *
 *   bun run src/real-sandbox.ts            (VERCEL_SANDBOX_*, SANDBOX_GATE_SECRET, CDN_R2_*)
 *
 * Publishes the bundle first so the box can fetch it if the image is older.
 * Leaves the sandbox up for inspection on failure; deletes it on success.
 */
import { randomUUID } from "node:crypto";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import {
	SANDBOX_CONTRACT_VERSION,
	type SandboxIdentity,
} from "@superset/shared/sandbox-contract";
import { Sandbox } from "@vercel/sandbox";

process.env.SKIP_ENV_VALIDATION ??= "1";

const started = Date.now();
const log = (line: string) =>
	console.log(
		`${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s ${line}`,
	);
const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
if (
	!credentials.token ||
	!credentials.teamId ||
	!credentials.projectId ||
	!process.env.SANDBOX_GATE_SECRET
) {
	console.error(
		"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID, VERCEL_SANDBOX_PROJECT_ID and SANDBOX_GATE_SECRET are required",
	);
	process.exit(64);
}

const { buildBundle, publishBundle } = await import("./build");
const bundle = buildBundle();
await publishBundle(bundle, { dry: false });

const { deleteSandbox, provisionSandbox, sandboxHostSecretFor, wakeSandbox } =
	await import("@superset/trpc/lib/sandbox");
const { checkWakeLog, probeBox } = await import("./environments/probe");

const name = `ws-real-check-${Date.now().toString(36)}`;
const workspaceId = randomUUID();
// Cut from main the way a real workspace is, so the probe's branch check
// covers the branching itself and not just that a checkout happened.
const workingBranch = `superset/real-check-${workspaceId.slice(0, 8)}`;
const identity: SandboxIdentity = {
	SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
	SUPERSET_BUNDLE_SHA: bundle.sha256,
	SUPERSET_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
	SUPERSET_SANDBOX_WORKSPACE_ID: workspaceId,
	SUPERSET_SANDBOX_ORGANIZATION_ID: randomUUID(),
	SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
		{
			url: "https://github.com/superset-sh/superset.git",
			branch: workingBranch,
			baseBranch: "main",
			path: ".",
		},
	]),
	SUPERSET_SANDBOX_IMAGE_TAG: SANDBOX_IMAGE_NAME,
	SUPERSET_SANDBOX_PROVIDER: "vercel",
};
const hostSecret = await sandboxHostSecretFor(workspaceId);
const claim = {
	identity,
	hostSecret,
	managedEnv: { SUPERSET_REAL_CHECK: "1" },
	networkPolicy: "allow-all" as const,
};

log(
	`provisioning ${name} from ${SANDBOX_IMAGE_NAME} on bundle ${bundle.sha256.slice(0, 12)}`,
);
// A freshly pushed image sits in `Preparing` while the registry optimises
// it, and create answers 409 until then.
const deadline = Date.now() + 20 * 60_000;
for (;;) {
	try {
		await provisionSandbox({
			name,
			environment: {
				sourceKind: "image",
				sourceRef: SANDBOX_IMAGE_NAME,
				region: process.env.VERCEL_SANDBOX_REGION ?? "sfo1",
			},
			claim,
		});
		break;
	} catch (error) {
		const notReady =
			String(error).includes("409") ||
			String(error).includes("image_not_ready");
		if (!notReady || Date.now() > deadline) throw error;
		log("image still preparing in the registry, waiting");
		await new Promise((resolve) => setTimeout(resolve, 15_000));
	}
}
const woken = await wakeSandbox({ providerSandboxId: name, claim });
log(
	`host-service answered at ${woken.hostTarget} (${Date.now() - started} ms since start)`,
);
let failed = await probeBox({
	name,
	credentials,
	hostSecret,
	bundleSha: bundle.sha256,
	branch: workingBranch,
	primaryPath: ".",
	gate: process.env.SANDBOX_GATE_ORIGIN
		? { workspaceId, userId: randomUUID() }
		: null,
	log,
});
{
	const box = await Sandbox.get({ ...credentials, name });
	await box.stop();
	const wakeStarted = Date.now();
	await wakeSandbox({ providerSandboxId: name, claim });
	log(`woken again in ${Date.now() - wakeStarted} ms`);
	failed += await checkWakeLog({ name, credentials, log });
}
if (failed) {
	console.error(`${failed} check(s) failed; ${name} left for inspection`);
	process.exit(1);
}
await deleteSandbox(name);
log(`${name} deleted; all checks passed`);
process.exit(0);
