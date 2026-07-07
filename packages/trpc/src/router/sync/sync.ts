import { db } from "@superset/db/client";
import {
	agentCommands,
	apikeys,
	automationRuns,
	automations,
	chatSessions,
	devicePresence,
	githubPullRequests,
	githubRepositories,
	integrationConnections,
	invitations,
	members,
	organizations,
	projects,
	subscriptions,
	taskStatuses,
	tasks,
	teamMembers,
	teams,
	users,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	workspaces,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

/**
 * Read-side replacement for the ElectricSQL shape proxy. Each org-scoped table
 * the desktop/mobile clients used to sync via Electric shapes is exposed here as
 * a poll. Authorization mirrors apps/electric-proxy/src/where.ts (row-scoping)
 * and electric.ts (column masking) exactly, so no more columns leak than Electric
 * exposed. (v2_workspaces is intentionally absent — it is local-first, served by
 * the host-service, not this endpoint.)
 */

export const SYNC_TABLES = [
	"tasks",
	"task_statuses",
	"projects",
	"v2_projects",
	"v2_hosts",
	"v2_clients",
	"v2_users_hosts",
	"workspaces",
	"auth.members",
	"auth.invitations",
	"auth.teams",
	"auth.team_members",
	"auth.users",
	"auth.organizations",
	"auth.apikeys",
	"device_presence",
	"agent_commands",
	"integration_connections",
	"subscriptions",
	"chat_sessions",
	"github_repositories",
	"github_pull_requests",
	"automations",
	"automation_runs",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

// Mirrors COLUMN_RESTRICTIONS in apps/electric-proxy/src/electric.ts: only the
// non-sensitive columns of these tables are ever returned (no API key secrets,
// no OAuth access/refresh tokens).
const apiKeyColumns = {
	id: apikeys.id,
	name: apikeys.name,
	start: apikeys.start,
	createdAt: apikeys.createdAt,
	lastRequest: apikeys.lastRequest,
} as const;

const integrationConnectionColumns = {
	id: integrationConnections.id,
	organizationId: integrationConnections.organizationId,
	connectedByUserId: integrationConnections.connectedByUserId,
	provider: integrationConnections.provider,
	tokenExpiresAt: integrationConnections.tokenExpiresAt,
	externalOrgId: integrationConnections.externalOrgId,
	externalOrgName: integrationConnections.externalOrgName,
	config: integrationConnections.config,
	createdAt: integrationConnections.createdAt,
	updatedAt: integrationConnections.updatedAt,
} as const;

async function pullTable(
	table: SyncTable,
	organizationId: string,
	userId: string,
): Promise<unknown[]> {
	switch (table) {
		case "tasks":
			return db
				.select()
				.from(tasks)
				.where(eq(tasks.organizationId, organizationId));
		case "task_statuses":
			return db
				.select()
				.from(taskStatuses)
				.where(eq(taskStatuses.organizationId, organizationId));
		case "projects":
			return db
				.select()
				.from(projects)
				.where(eq(projects.organizationId, organizationId));
		case "v2_projects":
			return db
				.select()
				.from(v2Projects)
				.where(eq(v2Projects.organizationId, organizationId));
		case "v2_hosts":
			return db
				.select()
				.from(v2Hosts)
				.where(eq(v2Hosts.organizationId, organizationId));
		case "v2_clients":
			return db
				.select()
				.from(v2Clients)
				.where(eq(v2Clients.organizationId, organizationId));
		case "v2_users_hosts":
			return db
				.select()
				.from(v2UsersHosts)
				.where(eq(v2UsersHosts.organizationId, organizationId));
		case "workspaces":
			return db
				.select()
				.from(workspaces)
				.where(eq(workspaces.organizationId, organizationId));
		case "auth.members":
			return db
				.select()
				.from(members)
				.where(eq(members.organizationId, organizationId));
		case "auth.invitations":
			return db
				.select()
				.from(invitations)
				.where(eq(invitations.organizationId, organizationId));
		case "auth.teams":
			return db
				.select()
				.from(teams)
				.where(eq(teams.organizationId, organizationId));
		case "auth.team_members":
			return db
				.select()
				.from(teamMembers)
				.where(eq(teamMembers.organizationId, organizationId));
		case "auth.users":
			return db
				.select()
				.from(users)
				.where(arrayContains(users.organizationIds, [organizationId]));
		case "auth.organizations": {
			const memberships = await db
				.select({ organizationId: members.organizationId })
				.from(members)
				.where(eq(members.userId, userId));
			const ids = memberships.map((m) => m.organizationId);
			if (ids.length === 0) return [];
			return db
				.select()
				.from(organizations)
				.where(inArray(organizations.id, ids));
		}
		case "auth.apikeys":
			return db
				.select(apiKeyColumns)
				.from(apikeys)
				.where(eq(apikeys.organizationId, organizationId));
		case "device_presence":
			return db
				.select()
				.from(devicePresence)
				.where(eq(devicePresence.organizationId, organizationId));
		case "agent_commands":
			return db
				.select()
				.from(agentCommands)
				.where(eq(agentCommands.organizationId, organizationId));
		case "integration_connections":
			return db
				.select(integrationConnectionColumns)
				.from(integrationConnections)
				.where(eq(integrationConnections.organizationId, organizationId));
		case "subscriptions":
			return db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.referenceId, organizationId));
		case "chat_sessions":
			return db
				.select()
				.from(chatSessions)
				.where(eq(chatSessions.organizationId, organizationId));
		case "github_repositories":
			return db
				.select()
				.from(githubRepositories)
				.where(eq(githubRepositories.organizationId, organizationId));
		case "github_pull_requests":
			return db
				.select()
				.from(githubPullRequests)
				.where(eq(githubPullRequests.organizationId, organizationId));
		case "automations":
			return db
				.select()
				.from(automations)
				.where(eq(automations.organizationId, organizationId));
		case "automation_runs":
			return db
				.select()
				.from(automationRuns)
				.where(eq(automationRuns.organizationId, organizationId));
	}
}

export const syncRouter = createTRPCRouter({
	pull: protectedProcedure
		.input(
			z.object({
				table: z.enum(SYNC_TABLES),
				organizationId: z.string().uuid().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			// The global organizations collection is membership-derived.
			if (input.table === "auth.organizations") {
				return pullTable(input.table, "", userId);
			}

			if (!input.organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `organizationId is required to sync ${input.table}`,
				});
			}

			// Org row-security: the caller must belong to the org they pull.
			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.userId, userId),
					eq(members.organizationId, input.organizationId),
				),
			});
			if (!membership) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `Not a member of organization ${input.organizationId}`,
				});
			}

			return pullTable(input.table, input.organizationId, userId);
		}),
});
