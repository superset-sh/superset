import { db } from "@superset/db/client";
import { type GitLabConfig, integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { GitLabClient } from "../client";
import { syncOneMergeRequest } from "../sync";
import {
	extractMergeRef,
	type GitLabWebhookPayload,
	safeEqual,
} from "../webhook-utils";

/**
 * Per-project GitLab webhook (parity with GitHub's webhook-driven updates). The
 * connection id rides in the query string; auth is the shared `X-Gitlab-Token`
 * secret, verified constant-time (§7 — GitLab uses a shared secret, not HMAC).
 * For any MR-related event we re-fetch that one MR so the stored §6 facts stay
 * faithful, then upsert (idempotent — GitLab redelivers).
 */
export async function POST(request: Request) {
	const url = new URL(request.url);
	const connectionId = url.searchParams.get("connection");
	const token = request.headers.get("x-gitlab-token");
	if (!connectionId || !token) {
		return Response.json(
			{ error: "Missing connection or token" },
			{ status: 401 },
		);
	}

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, connectionId),
			eq(integrationConnections.provider, "gitlab"),
		),
	});
	if (!connection) {
		return Response.json({ error: "Unknown connection" }, { status: 404 });
	}

	const config = connection.config as GitLabConfig | null;
	if (!config?.webhookSecret || !safeEqual(token, config.webhookSecret)) {
		return Response.json({ error: "Invalid token" }, { status: 401 });
	}

	let payload: GitLabWebhookPayload;
	try {
		payload = (await request.json()) as GitLabWebhookPayload;
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// Pipeline/note events not attached to an MR aren't tracked — ack and skip.
	const ref = extractMergeRef(payload);
	if (!ref) {
		return Response.json({ ok: true, skipped: true });
	}

	try {
		const client = await GitLabClient.create(
			config.host,
			connection.accessToken,
		);
		const synced = await syncOneMergeRequest(
			client,
			connection,
			config.host,
			ref.projectId,
			ref.iid,
		);
		return Response.json({ ok: true, synced });
	} catch (error) {
		console.error("[gitlab/webhook] Failed:", error);
		return Response.json({ error: "Processing failed" }, { status: 500 });
	}
}
