import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections, tasks, users } from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { mapLinearPriority } from "@/lib/integrations/linear/utils";

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

	const isValid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/initial-sync`,
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
	const teamsResponse = await client.teams();
	const teams = teamsResponse.nodes;

	if (teams.length === 0) {
		return;
	}

	const allIssueData = (
		await Promise.all(
			teams.map(async (team) => {
				const issuesResponse = await team.issues({
					first: 100,
					filter: { state: { type: { nin: ["canceled", "completed"] } } },
				});

				const issueData = await Promise.all(
					issuesResponse.nodes.map(async (issue) => {
						const [assignee, labels, state] = await Promise.all([
							issue.assignee,
							issue.labels(),
							issue.state,
						]);
						return { issue, assignee, labels: labels.nodes, state };
					}),
				);

				return issueData;
			}),
		)
	).flat();

	const assigneeEmails = [
		...new Set(
			allIssueData
				.map((d) => d.assignee?.email)
				.filter((e): e is string => !!e),
		),
	];

	const matchedUsers =
		assigneeEmails.length > 0
			? await db.query.users.findMany({
					where: inArray(users.email, assigneeEmails),
				})
			: [];

	const userByEmail = new Map(matchedUsers.map((u) => [u.email, u.id]));

	for (const { issue, assignee, labels, state } of allIssueData) {
		const assigneeId = assignee?.email
			? (userByEmail.get(assignee.email) ?? null)
			: null;

		const taskData = {
			slug: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			status: state?.name ?? "Backlog",
			statusColor: state?.color ?? null,
			statusType: state?.type ?? null,
			priority: mapLinearPriority(issue.priority),
			assigneeId,
			estimate: issue.estimate ?? null,
			dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
			labels: labels.map((l) => l.name),
			startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
			completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
			externalProvider: "linear" as const,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
			lastSyncedAt: new Date(),
		};

		await db
			.insert(tasks)
			.values({
				...taskData,
				organizationId,
				creatorId: creatorUserId,
			})
			.onConflictDoUpdate({
				target: [tasks.externalProvider, tasks.externalId],
				set: { ...taskData, syncError: null },
			});
	}
}
