import * as Sentry from "@sentry/nextjs";
import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { reconcileWatches } from "../../lib/reconcileWatches";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Stays inside maxDuration so a run ends by choice rather than by kill. */
const TIME_BUDGET_MS = 240_000;

const bodySchema = z.object({ connectionId: z.string().uuid().optional() });

/**
 * Daily, and once per connection right after it connects. Any failure answers
 * 500 so QStash retries and reports it; a retry only redoes what is still due.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/google/jobs/renew-watches",
	);
	if (rejected) return rejected;

	let json: unknown = {};
	if (body) {
		try {
			json = JSON.parse(body);
		} catch {
			return Response.json({ error: "Invalid JSON" }, { status: 400 });
		}
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const topicName = env.GOOGLE_PUBSUB_TOPIC;
	if (!topicName) {
		console.error(
			"[google/renew-watches] GOOGLE_PUBSUB_TOPIC is not set; no Gmail watch can be created",
		);
		return Response.json({ error: "No Pub/Sub topic" }, { status: 503 });
	}

	const rows = await db
		.select({ id: connections.id, email: connections.externalAccountId })
		.from(connections)
		.where(
			and(
				eq(connections.connector, "google"),
				isNull(connections.disconnectedAt),
				...(parsed.data.connectionId
					? [eq(connections.id, parsed.data.connectionId)]
					: []),
			),
		);

	const deadline = Date.now() + TIME_BUDGET_MS;
	const results = [];
	const failed: string[] = [];
	let deferred = 0;
	for (const connection of rows) {
		if (Date.now() > deadline) {
			deferred += 1;
			continue;
		}
		let errors: string[];
		try {
			const result = await reconcileWatches(connection.id, topicName);
			errors = result.errors;
			results.push({ connectionId: connection.id, ...result });
		} catch (error) {
			errors = [error instanceof Error ? error.message : String(error)];
			results.push({ connectionId: connection.id, errors });
		}
		if (errors.length === 0) continue;
		failed.push(connection.id);
		console.error(
			`[google/renew-watches] ${connection.id} (${connection.email}): ${errors.join("; ")}`,
		);
		Sentry.captureException(
			new Error(`Gmail watch renewal failed: ${connection.id}`),
			{
				tags: { feature: "gmail-watch" },
				extra: { connectionId: connection.id, errors },
			},
		);
	}
	if (deferred > 0) {
		console.error(
			`[google/renew-watches] out of time; ${deferred} connections left for the retry`,
		);
	}

	const ok = failed.length === 0 && deferred === 0;
	return Response.json(
		{ connections: rows.length, failed, deferred, results },
		{ status: ok ? 200 : 500 },
	);
}
