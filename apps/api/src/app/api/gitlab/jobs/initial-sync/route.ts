import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { syncGitLabConnection } from "../../sync";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	connectionId: z.string().uuid(),
	organizationId: z.string().uuid(),
});

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
				url: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/jobs/initial-sync`,
			})
			.catch((error) => {
				console.error("[gitlab/initial-sync] Signature verify failed:", error);
				return false;
			});
		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let bodyData: unknown;
	try {
		bodyData = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(bodyData);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { connectionId, organizationId } = parsed.data;

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, connectionId),
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "gitlab"),
		),
	});
	if (!connection) {
		return Response.json(
			{ error: "Connection not found", skipped: true },
			{ status: 404 },
		);
	}

	try {
		const result = await syncGitLabConnection(connection, {
			incremental: false,
		});
		console.log(
			`[gitlab/initial-sync] Synced ${result.projects} projects, ${result.mergeRequests} MRs`,
		);
		return Response.json({ success: true, ...result });
	} catch (error) {
		console.error("[gitlab/initial-sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
