import { Receiver } from "@upstash/qstash";

import { env } from "@/env";
import { mirrorGithubToGeneric } from "../../mirror-to-generic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * One-time (idempotent) backfill of all existing GitHub rows into the generic
 * `repositories` / `pull_requests` tables. Run once after migration 0059 is applied,
 * before relying on the generic read paths. Safe to re-run. QStash-verified (or dev).
 */
export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}
		const isValid = await receiver
			.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/backfill-generic`,
			})
			.catch((error) => {
				console.error("[github/backfill-generic] Verify failed:", error);
				return false;
			});
		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	try {
		await mirrorGithubToGeneric();
		console.log("[github/backfill-generic] Backfill complete");
		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/backfill-generic] Backfill failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Backfill failed" },
			{ status: 500 },
		);
	}
}
