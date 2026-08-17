import { buildConflictUpdateColumns, db } from "@superset/db";
import { members, tasks, users } from "@superset/db/schema";
import {
	callPlain,
	ensurePlainStatuses,
	fetchAllThreads,
	mapThreadToTask,
	type PlainClient,
} from "@superset/trpc/integrations/plain";
import { Receiver } from "@upstash/qstash";
import { and, eq, inArray } from "drizzle-orm";
import chunk from "lodash.chunk";
import { z } from "zod";
import { env } from "@/env";

const BATCH_SIZE = 100;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	organizationId: z.uuid(),
	creatorUserId: z.uuid(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	// Skip signature verification in development (QStash can't reach localhost)
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}

		const isValid = await receiver.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/plain/jobs/initial-sync`,
		});

		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = payloadSchema.safeParse(parsedBody);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId, creatorUserId } = parsed.data;

	// callPlain marks the connection disconnected on an auth failure, so a
	// revoked key surfaces as "reconnect required" instead of silent retries.
	const result = await callPlain(organizationId, (client) =>
		performInitialSync(client, organizationId, creatorUserId),
	);
	if (result === null) {
		return Response.json({
			error: "No Plain connection or connection disconnected",
			skipped: true,
		});
	}

	return Response.json({ success: true, synced: result.synced });
}

async function performInitialSync(
	client: PlainClient,
	organizationId: string,
	creatorUserId: string,
): Promise<{ synced: number }> {
	// Plain statuses are additive: existing default or Linear statuses stay
	// untouched, unlike the Linear initial sync which replaces the defaults.
	const statusByExternalId = await ensurePlainStatuses(organizationId);

	const threads = await fetchAllThreads(client);

	if (threads.length === 0) {
		return { synced: 0 };
	}

	const assigneeEmails = [
		...new Set(
			threads
				.map((thread) =>
					thread.assignedTo?.__typename === "User"
						? thread.assignedTo.email
						: null,
				)
				.filter((email): email is string => !!email),
		),
	];

	const matchedUsers =
		assigneeEmails.length > 0
			? await db
					.select({ id: users.id, email: users.email })
					.from(users)
					.innerJoin(members, eq(members.userId, users.id))
					.where(
						and(
							inArray(users.email, assigneeEmails),
							eq(members.organizationId, organizationId),
						),
					)
			: [];

	const userByEmail = new Map(matchedUsers.map((u) => [u.email, u.id]));

	const taskValues = threads
		.map((thread) =>
			mapThreadToTask(
				thread,
				organizationId,
				creatorUserId,
				userByEmail,
				statusByExternalId,
			),
		)
		.filter((task) => task !== null);

	const batches = chunk(taskValues, BATCH_SIZE);

	let synced = 0;
	for (const batch of batches) {
		await db
			.insert(tasks)
			.values(batch)
			.onConflictDoUpdate({
				target: [
					tasks.organizationId,
					tasks.externalProvider,
					tasks.externalId,
				],
				set: {
					...buildConflictUpdateColumns(tasks, [
						"slug",
						"title",
						"description",
						"statusId",
						"priority",
						"assigneeId",
						"assigneeExternalId",
						"assigneeDisplayName",
						"assigneeAvatarUrl",
						"labels",
						"completedAt",
						"externalKey",
						"lastSyncedAt",
					]),
					syncError: null,
				},
			});
		synced += batch.length;
	}

	return { synced };
}
