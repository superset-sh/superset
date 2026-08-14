import { buildConflictUpdateColumns, db } from "@superset/db";
import { members, tasks, users } from "@superset/db/schema";
import {
	ensurePlainStatuses,
	fetchAllThreads,
	getPlainClient,
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
	organizationId: z.string().min(1),
	creatorUserId: z.string().min(1),
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

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId, creatorUserId } = parsed.data;

	const client = await getPlainClient(organizationId);
	if (!client) {
		return Response.json({
			error: "No Plain connection or connection disconnected",
			skipped: true,
		});
	}

	await performInitialSync(client, organizationId, creatorUserId);

	return Response.json({ success: true });
}

async function performInitialSync(
	client: PlainClient,
	organizationId: string,
	creatorUserId: string,
) {
	// Plain statuses are additive: existing default or Linear statuses stay
	// untouched, unlike the Linear initial sync which replaces the defaults.
	const statusByExternalId = await ensurePlainStatuses(organizationId);

	const threads = await fetchAllThreads(client);

	if (threads.length === 0) {
		return;
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
	}
}
