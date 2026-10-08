import { timingSafeEqual } from "node:crypto";
import { sandboxHostSecret } from "@superset/shared/sandbox-gate";
import { z } from "zod";
import { env } from "../../env";

export async function authorizeFreestyleIngress(
	request: Request,
): Promise<Response> {
	const host = request.headers.get("x-forwarded-host") ?? "";
	const match = /^ss-([0-9a-f]{32})-[0-9a-f]{12}\.style\.dev$/.exec(host);
	const raw = match?.[1];
	const workspaceId = z
		.uuid()
		.safeParse(
			raw
				? `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
				: null,
		);
	if (!workspaceId.success) return new Response(null, { status: 401 });
	const expected = Buffer.from(
		`Bearer ${await sandboxHostSecret(env.SANDBOX_GATE_SECRET, workspaceId.data)}`,
	);
	const supplied = Buffer.from(request.headers.get("authorization") ?? "");
	const allowed =
		supplied.length === expected.length && timingSafeEqual(supplied, expected);
	return new Response(null, {
		status: allowed ? 204 : 401,
		headers: { "cache-control": "no-store" },
	});
}
