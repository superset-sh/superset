import { LinearClient } from "@linear/sdk";
import { buildConflictUpdateColumns, db } from "@superset/db";
import { integrationConnections, tasks, users } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq, inArray } from "drizzle-orm";
import chunk from "lodash.chunk";
import { z } from "zod";
import { env } from "@/env";
import { fetchAllIssues, mapIssueToTask } from "./utils";

const BATCH_SIZE = 100;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	organizationId: z.string().min(1),
	creatorUserId: z.string().min(1),
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	// TODO: In production, use env.NEXT_PUBLIC_API_URL
	const qstashBaseUrl = "https://e7e7cc5a4723.ngrok-free.app";
	const isValid = await receiver.verify({
		body,
		signature,
		url: `${qstashBaseUrl}/api/integrations/linear/jobs/initial-sync`,
	});

	if (!isValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId, creatorUserId } = parsed.data;

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		return Response.json({ error: "No connection found", skipped: true });
	}

	const client = new LinearClient({ accessToken: connection.accessToken });
	await performInitialSync(client, organizationId, creatorUserId);

	return Response.json({ success: true });
}

async function performInitialSync(
	client: LinearClient,
	organizationId: string,
	creatorUserId: string,
) {
	const issues = await fetchAllIssues(client);

	if (issues.length === 0) {
		return;
	}

	const assigneeEmails = [
		...new Set(
			issues.map((i) => i.assignee?.email).filter((e): e is string => !!e),
		),
	];

	const matchedUsers =
		assigneeEmails.length > 0
			? await db.query.users.findMany({
					where: inArray(users.email, assigneeEmails),
				})
			: [];

	const userByEmail = new Map(matchedUsers.map((u) => [u.email, u.id]));

	const taskValues = issues.map((issue) =>
		mapIssueToTask(issue, organizationId, creatorUserId, userByEmail),
	);

	const batches = chunk(taskValues, BATCH_SIZE);

	for (const batch of batches) {
		await db
			.insert(tasks)
			.values(batch)
			.onConflictDoUpdate({
				target: [tasks.externalProvider, tasks.externalId],
				set: {
					...buildConflictUpdateColumns(tasks, [
						"slug",
						"title",
						"description",
						"status",
						"statusColor",
						"statusType",
						"priority",
						"assigneeId",
						"estimate",
						"dueDate",
						"labels",
						"startedAt",
						"completedAt",
						"externalKey",
						"externalUrl",
						"lastSyncedAt",
					]),
					syncError: null,
				},
			});
	}
}
