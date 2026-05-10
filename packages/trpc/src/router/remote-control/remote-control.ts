import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	remoteControlSessionModeValues,
	remoteControlSessionStatusValues,
} from "@superset/db/enums";
import {
	users,
	v2Hosts,
	v2RemoteControlSessions,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	REMOTE_CONTROL_DEFAULT_TTL_SEC,
	REMOTE_CONTROL_MAX_TTL_SEC,
	REMOTE_CONTROL_MIN_TTL_SEC,
	REMOTE_CONTROL_TOKEN_PARAM,
} from "@superset/shared/remote-control-protocol";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { relayMutation } from "../automation/relay-client";
import { requireActiveOrgMembership } from "../utils/active-org";

interface MintTokenResult {
	token: string;
	tokenHash: string;
	expiresAt: number;
}

const createInput = z.object({
	workspaceId: z.string().uuid(),
	terminalId: z.string().min(1),
	mode: z.enum(remoteControlSessionModeValues),
	ttlSec: z
		.number()
		.int()
		.min(REMOTE_CONTROL_MIN_TTL_SEC)
		.max(REMOTE_CONTROL_MAX_TTL_SEC)
		.optional(),
});

const sessionIdInput = z.object({ sessionId: z.string().uuid() });
const listInput = z.object({ workspaceId: z.string().uuid() });

function buildWebUrl(sessionId: string, token: string): string {
	const base = env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "");
	const t = encodeURIComponent(token);
	return `${base}/agents/remote-control/${sessionId}?${REMOTE_CONTROL_TOKEN_PARAM}=${t}`;
}

function buildWsUrl(routingKey: string, sessionId: string): string {
	const httpToWs = env.RELAY_URL.replace(/^http/, "ws").replace(/\/$/, "");
	return `${httpToWs}/hosts/${routingKey}/remote-control/${sessionId}`;
}

async function getWorkspaceWithHost(
	workspaceId: string,
	organizationId: string,
) {
	const ws = await dbWs.query.v2Workspaces.findFirst({
		where: and(
			eq(v2Workspaces.id, workspaceId),
			eq(v2Workspaces.organizationId, organizationId),
		),
	});
	if (!ws) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found in this organization",
		});
	}
	const host = await dbWs.query.v2Hosts.findFirst({
		where: and(
			eq(v2Hosts.organizationId, organizationId),
			eq(v2Hosts.machineId, ws.hostId),
		),
	});
	if (!host) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host record missing for workspace",
		});
	}
	return { workspace: ws, host };
}

async function ensureUserOnHost(
	userId: string,
	organizationId: string,
	hostId: string,
) {
	const membership = await dbWs.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, organizationId),
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, hostId),
		),
	});
	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not a member of this host",
		});
	}
}

export const remoteControlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { workspace, host } = await getWorkspaceWithHost(
				input.workspaceId,
				organizationId,
			);
			await ensureUserOnHost(userId, organizationId, host.machineId);

			const sessionId = crypto.randomUUID();
			const ttlSec = input.ttlSec ?? REMOTE_CONTROL_DEFAULT_TTL_SEC;

			const [owner] = await dbWs
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			const jwt = await mintUserJwt({
				userId,
				email: owner?.email,
				organizationIds: [organizationId],
				scope: "remote-control",
				ttlSeconds: 300,
			});
			const routingKey = buildHostRoutingKey(organizationId, host.machineId);

			const minted = await relayMutation<
				{
					sessionId: string;
					terminalId: string;
					workspaceId: string;
					mode: "command" | "full";
					createdByUserId: string;
					ttlSec?: number;
				},
				MintTokenResult
			>(
				{ relayUrl: env.RELAY_URL, hostId: routingKey, jwt },
				"terminal.remoteControl.mintToken",
				{
					sessionId,
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					mode: input.mode,
					createdByUserId: userId,
					ttlSec,
				},
			);

			const expiresAt = new Date(minted.expiresAt * 1000);
			await dbWs.insert(v2RemoteControlSessions).values({
				id: sessionId,
				organizationId,
				hostId: host.machineId,
				workspaceId: workspace.id,
				terminalId: input.terminalId,
				createdByUserId: userId,
				mode: input.mode,
				status: "active",
				tokenHash: minted.tokenHash,
				expiresAt,
			});

			return {
				sessionId,
				token: minted.token,
				expiresAt: expiresAt.toISOString(),
				webUrl: buildWebUrl(sessionId, minted.token),
				wsUrl: buildWsUrl(routingKey, sessionId),
				routingKey,
				mode: input.mode,
			};
		}),

	get: protectedProcedure
		.input(sessionIdInput)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const row = await dbWs.query.v2RemoteControlSessions.findFirst({
				where: and(
					eq(v2RemoteControlSessions.id, input.sessionId),
					eq(v2RemoteControlSessions.organizationId, organizationId),
				),
			});
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Remote control session not found",
				});
			}
			const routingKey = buildHostRoutingKey(organizationId, row.hostId);
			return {
				sessionId: row.id,
				workspaceId: row.workspaceId,
				terminalId: row.terminalId,
				mode: row.mode,
				status: row.status,
				expiresAt: row.expiresAt.toISOString(),
				wsUrl: buildWsUrl(routingKey, row.id),
				routingKey,
			};
		}),

	revoke: protectedProcedure
		.input(sessionIdInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const row = await dbWs.query.v2RemoteControlSessions.findFirst({
				where: and(
					eq(v2RemoteControlSessions.id, input.sessionId),
					eq(v2RemoteControlSessions.organizationId, organizationId),
				),
			});
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Remote control session not found",
				});
			}
			// The cloud row gets revoked first so even if the host call fails,
			// future attaches via the host see "session not found" or are denied
			// when the host is told later via retry / re-sync.
			await dbWs
				.update(v2RemoteControlSessions)
				.set({
					status: "revoked",
					revokedAt: new Date(),
					revokedByUserId: userId,
				})
				.where(eq(v2RemoteControlSessions.id, input.sessionId));

			try {
				const [owner] = await dbWs
					.select({ email: users.email })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				const jwt = await mintUserJwt({
					userId,
					email: owner?.email,
					organizationIds: [organizationId],
					scope: "remote-control",
					ttlSeconds: 60,
				});
				const routingKey = buildHostRoutingKey(organizationId, row.hostId);
				await relayMutation<{ sessionId: string }, unknown>(
					{ relayUrl: env.RELAY_URL, hostId: routingKey, jwt, timeoutMs: 5000 },
					"terminal.remoteControl.revoke",
					{ sessionId: input.sessionId },
				);
			} catch (err) {
				console.warn(
					"[remote-control] best-effort host revoke failed:",
					err instanceof Error ? err.message : String(err),
				);
			}

			return { sessionId: input.sessionId, status: "revoked" as const };
		}),

	listForWorkspace: protectedProcedure
		.input(listInput)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rows = await dbWs.query.v2RemoteControlSessions.findMany({
				where: and(
					eq(v2RemoteControlSessions.workspaceId, input.workspaceId),
					eq(v2RemoteControlSessions.organizationId, organizationId),
				),
				orderBy: [desc(v2RemoteControlSessions.createdAt)],
				limit: 50,
			});
			return rows.map((r) => ({
				sessionId: r.id,
				terminalId: r.terminalId,
				mode: r.mode,
				status: r.status,
				createdAt: r.createdAt.toISOString(),
				expiresAt: r.expiresAt.toISOString(),
				revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
			}));
		}),

	expireStale: protectedProcedure.mutation(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		// Idempotent — safe for cron / manual sweep.
		const updated = await dbWs
			.update(v2RemoteControlSessions)
			.set({ status: "expired" })
			.where(
				and(
					eq(v2RemoteControlSessions.organizationId, organizationId),
					eq(v2RemoteControlSessions.status, "active"),
					lt(v2RemoteControlSessions.expiresAt, new Date()),
				),
			)
			.returning({ id: v2RemoteControlSessions.id });
		return { count: updated.length };
	}),

	statuses: protectedProcedure.query(() => remoteControlSessionStatusValues),
});
