import { expect, test } from "bun:test";
import { sandboxHostSecret } from "@superset/shared/sandbox-gate";
import { setTestEnv } from "../../../test/env";
import { authorizeFreestyleIngress } from "./freestyle-auth";

const secret = "test-gate-secret-at-least-32-characters";
setTestEnv({ SANDBOX_GATE_SECRET: secret });
const workspace = "11111111-2222-4333-8444-555555555555";
const host = `ss-${workspace.replaceAll("-", "")}-abcdef123456.style.dev`;
const request = (authorization: string, forwardedHost = host) =>
	new Request("https://api.example/auth", {
		headers: { authorization, "x-forwarded-host": forwardedHost },
	});

test("ingress accepts the gate's host credential bound to the edge-authenticated workspace hostname", async () => {
	const authorization = `Bearer ${await sandboxHostSecret(secret, workspace)}`;
	expect((await authorizeFreestyleIngress(request(authorization))).status).toBe(
		204,
	);
	expect(
		(
			await authorizeFreestyleIngress(
				request(authorization, host.replace("11111111", "aaaaaaaa")),
			)
		).status,
	).toBe(401);
});
test("missing, forged, and client-selected workspace identities cannot authorize ingress", async () => {
	expect((await authorizeFreestyleIngress(request(""))).status).toBe(401);
	expect(
		(await authorizeFreestyleIngress(request("Bearer forged"))).status,
	).toBe(401);
	expect(
		(await authorizeFreestyleIngress(request("Bearer forged", "evil.example")))
			.status,
	).toBe(401);
});
