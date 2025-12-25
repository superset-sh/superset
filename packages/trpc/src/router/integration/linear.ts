import { db, dbWs } from "@superset/db/client";
import { organizationMembers, tasks, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	disconnectLinear,
	getLinearClient,
	getLinearConnection,
	getLinearTeams,
	mapPriorityFromLinear,
	setDefaultLinearTeam,
} from "../../lib/integrations/linear";
import { protectedProcedure } from "../../trpc";

/**
 * Helper to verify user is org member
 */
async function verifyOrgMembership(
	clerkUserId: string,
	organizationId: string,
) {
	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});

	if (!user) {
		throw new Error("User not found");
	}

	const membership = await db.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.organizationId, organizationId),
			eq(organizationMembers.userId, user.id),
		),
	});

	if (!membership) {
		throw new Error("Not a member of this organization");
	}

	return { user, membership };
}

/**
 * Helper to verify user is org admin
 */
async function verifyOrgAdmin(clerkUserId: string, organizationId: string) {
	const { user, membership } = await verifyOrgMembership(
		clerkUserId,
		organizationId,
	);

	if (membership.role !== "admin") {
		throw new Error("Admin access required");
	}

	return { user, membership };
}

export const linearRouter = {
	/**
	 * Get Linear connection details for an organization
	 */
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.userId, input.organizationId);
			return getLinearConnection(input.organizationId);
		}),

	/**
	 * Get available Linear teams for team selection
	 */
	getTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.userId, input.organizationId);
			return getLinearTeams(input.organizationId);
		}),

	/**
	 * Set the default Linear team for task sync
	 */
	setDefaultTeam: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				teamId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.userId, input.organizationId);
			await setDefaultLinearTeam(input.organizationId, input.teamId);
			return { success: true };
		}),

	/**
	 * Disconnect Linear from an organization
	 */
	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.userId, input.organizationId);
			return disconnectLinear(input.organizationId);
		}),

	/**
	 * Sync issues from Linear to tasks table
	 */
	syncIssues: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				teamId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { user } = await verifyOrgAdmin(ctx.userId, input.organizationId);

			const client = await getLinearClient(input.organizationId);
			if (!client) {
				throw new Error("No Linear connection found");
			}

			let teamId = input.teamId;
			if (!teamId) {
				const connection = await getLinearConnection(input.organizationId);
				const config = connection?.config as { defaultTeamId?: string } | null;
				teamId = config?.defaultTeamId;
			}

			if (!teamId) {
				throw new Error(
					"No team selected. Please select a default team first.",
				);
			}

			// Fetch issues and states in parallel
			const team = await client.team(teamId);
			const [issues, states] = await Promise.all([
				team.issues({
					first: 100,
					filter: { state: { type: { nin: ["canceled", "completed"] } } },
				}),
				team.states(),
			]);

			const stateMap = new Map(
				states.nodes.map((s) => [
					s.id,
					{ name: s.name, color: s.color, type: s.type, position: s.position },
				]),
			);

			// Fetch all related data in parallel for each issue
			const issueData = await Promise.all(
				issues.nodes.map(async (issue) => {
					const [assignee, labels, state] = await Promise.all([
						issue.assignee,
						issue.labels(),
						issue.state,
					]);
					return { issue, assignee, labels: labels.nodes, state };
				}),
			);

			// Collect unique assignee emails and fetch users in one query
			const assigneeEmails = [
				...new Set(
					issueData
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

			// Get existing tasks in one query
			const externalIds = issueData.map((d) => d.issue.id);
			const existingTasks = await db.query.tasks.findMany({
				where: and(
					eq(tasks.externalProvider, "linear"),
					inArray(tasks.externalId, externalIds),
				),
			});
			const existingByExternalId = new Map(
				existingTasks.map((t) => [t.externalId, t]),
			);

			const results = { created: 0, updated: 0, errors: [] as string[] };

			// Process all issues in a transaction (dbWs supports transactions, db doesn't)
			await dbWs.transaction(async (tx) => {
				for (const { issue, assignee, labels, state } of issueData) {
					try {
						const stateData = state ? stateMap.get(state.id) : null;
						const assigneeId = assignee?.email
							? (userByEmail.get(assignee.email) ?? null)
							: null;

						const taskData = {
							title: issue.title,
							description: issue.description ?? null,
							status: stateData?.name ?? state?.name ?? "Backlog",
							statusColor: stateData?.color ?? null,
							statusType: stateData?.type ?? null,
							statusPosition: stateData?.position ?? null,
							priority: mapPriorityFromLinear(issue.priority),
							organizationId: input.organizationId,
							assigneeId,
							estimate: issue.estimate ?? null,
							dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
							labels: labels.map((l) => l.name),
							branch: issue.branchName,
							startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
							completedAt: issue.completedAt
								? new Date(issue.completedAt)
								: null,
							externalProvider: "linear" as const,
							externalId: issue.id,
							externalKey: issue.identifier,
							externalUrl: issue.url,
							lastSyncedAt: new Date(),
							syncError: null,
						};

						const existing = existingByExternalId.get(issue.id);
						if (existing) {
							await tx
								.update(tasks)
								.set(taskData)
								.where(eq(tasks.id, existing.id));
							results.updated++;
						} else {
							const slug = `${issue.identifier.toLowerCase()}-${Date.now()}`;
							await tx.insert(tasks).values({
								...taskData,
								slug,
								creatorId: user.id,
							});
							results.created++;
						}
					} catch (error) {
						const errorMsg =
							error instanceof Error ? error.message : "Unknown error";
						results.errors.push(`${issue.identifier}: ${errorMsg}`);
					}
				}
			});

			return { success: true, ...results, total: issues.nodes.length };
		}),

	/**
	 * Get sync status - shows how many issues are synced vs total
	 */
	getSyncStatus: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.userId, input.organizationId);

			// Count synced tasks
			const syncedTasks = await db.query.tasks.findMany({
				where: and(
					eq(tasks.organizationId, input.organizationId),
					eq(tasks.externalProvider, "linear"),
				),
				columns: { id: true, lastSyncedAt: true, syncError: true },
			});

			const withErrors = syncedTasks.filter((t) => t.syncError).length;
			const lastSync = syncedTasks.reduce(
				(latest, t) => {
					if (!t.lastSyncedAt) return latest;
					if (!latest) return t.lastSyncedAt;
					return t.lastSyncedAt > latest ? t.lastSyncedAt : latest;
				},
				null as Date | null,
			);

			return {
				syncedCount: syncedTasks.length,
				withErrors,
				lastSyncedAt: lastSync,
			};
		}),
} satisfies TRPCRouterRecord;
