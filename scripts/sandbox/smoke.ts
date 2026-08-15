/**
 * Exercises the Blaxel integration without the tRPC stack: provision, mint a
 * preview token, prove the URL rejects unauthenticated callers, tear down.
 *
 *   BLAXEL_API_KEY=... BLAXEL_WORKSPACE=superset bun run scripts/sandbox/smoke.ts
 *
 * Leaves nothing behind unless it throws; pass --keep to inspect the sandbox.
 */
import {
	deleteSandbox,
	mintPreviewAccess,
	provisionSandbox,
} from "../../packages/trpc/src/lib/blaxel";

const NAME = process.env.SMOKE_SANDBOX_NAME ?? "ws-smoke-test";
const IMAGE = process.env.BLAXEL_SANDBOX_IMAGE ?? "superset-hostsvc";
const keep = process.argv.includes("--keep");

const main = async () => {
	console.log(`provisioning ${NAME} from ${IMAGE} …`);
	const sandbox = await provisionSandbox({ name: NAME, image: IMAGE });
	console.log(`  preview: ${sandbox.previewUrl}`);
	console.log(`  region:  ${sandbox.region}  memory: ${sandbox.memoryMb}MB`);

	const access = await mintPreviewAccess(NAME);
	console.log(`  token minted, expires ${access.expiresAt.toISOString()}`);

	// Nothing is listening on 4879 yet — host-service lands in the next PR —
	// so both requests 502/504 *through* the edge. What matters here is that
	// the unauthenticated one is rejected at the edge instead.
	const anon = await fetch(`${access.url}/health`)
		.then((r) => r.status)
		.catch((e) => `ERR ${e}`);
	const authed = await fetch(`${access.url}/health`, {
		headers: { "X-Blaxel-Preview-Token": access.token },
	})
		.then((r) => r.status)
		.catch((e) => `ERR ${e}`);

	console.log(`\n  without token → ${anon}   (expect 401)`);
	console.log(
		`  with token    → ${authed}   (expect not-401: reaches sandbox)`,
	);

	const gatePasses = anon === 401 && authed !== 401;
	console.log(`\n${gatePasses ? "PASS" : "FAIL"}: preview auth gate`);

	if (!keep) {
		await deleteSandbox(NAME);
		console.log("torn down");
	} else {
		console.log(`kept: ${NAME}`);
	}
	process.exit(gatePasses ? 0 : 1);
};

main().catch((error) => {
	console.error("smoke failed:", error?.message ?? error);
	process.exit(1);
});
