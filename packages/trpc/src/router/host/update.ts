import { mintUserJwt } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import { hostUpdateAudit, v2UsersHosts } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { jwtProcedure } from "../../trpc";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const SUPERVISOR_DISPATCH_TIMEOUT_MS = 30_000;

/**
 * Global floor for `targetVersion`. Bump on security advisories. A constant
 * (not per-org) — Superset owns the security/CVE call, individual org admins
 * don't track advisories. Per-org overrides can land later if there's a real
 * use case; YAGNI for now.
 *
 * Floored at 0.2.8 — the version that introduces the remote-update RPC.
 * Anything older lacks the procedure and can't be remotely updated anyway.
 */
export const MINIMUM_ALLOWED_VERSION = "0.2.8";

interface HostUpdateRpcInput {
	targetVersion: string | null;
}

interface HostUpdateRpcOutput {
	outcome: "dispatched" | "satisfied" | "updated" | "failed";
	previousVersion: string | null;
	newVersion: string | null;
	supervisorPid: number | null;
}

function semverCompare(a: string, b: string): number {
	const [aMain = "", aPre = ""] = a.split("-", 2);
	const [bMain = "", bPre = ""] = b.split("-", 2);
	const aParts = aMain.split(".").map((n) => Number(n));
	const bParts = bMain.split(".").map((n) => Number(n));
	for (let i = 0; i < 3; i++) {
		const ai = aParts[i] ?? 0;
		const bi = bParts[i] ?? 0;
		if (ai !== bi) return ai - bi;
	}
	// Pre-release versions sort before the same main version (semver §11.4).
	if (aPre === bPre) return 0;
	if (aPre === "") return 1;
	if (bPre === "") return -1;
	return aPre < bPre ? -1 : 1;
}

export const hostUpdateProcedures = {
	update: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				targetVersion: z.string().regex(SEMVER_RE).optional(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<HostUpdateRpcOutput> => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const [link] = await db
				.select({ role: v2UsersHosts.role })
				.from(v2UsersHosts)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						eq(v2UsersHosts.organizationId, input.organizationId),
						eq(v2UsersHosts.hostId, input.machineId),
						eq(v2UsersHosts.role, "owner"),
					),
				)
				.limit(1);
			if (!link) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only host owners can trigger updates",
				});
			}

			if (
				input.targetVersion &&
				semverCompare(input.targetVersion, MINIMUM_ALLOWED_VERSION) < 0
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `Version ${input.targetVersion} is below the minimum allowed (${MINIMUM_ALLOWED_VERSION})`,
				});
			}

			const [recent] = await db
				.select({ requestedAt: hostUpdateAudit.requestedAt })
				.from(hostUpdateAudit)
				.where(
					and(
						eq(hostUpdateAudit.organizationId, input.organizationId),
						eq(hostUpdateAudit.machineId, input.machineId),
						gt(
							hostUpdateAudit.requestedAt,
							new Date(Date.now() - RATE_LIMIT_WINDOW_MS),
						),
					),
				)
				.orderBy(desc(hostUpdateAudit.requestedAt))
				.limit(1);
			if (recent) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "An update was already triggered for this host recently",
				});
			}

			const [auditRow] = await dbWs
				.insert(hostUpdateAudit)
				.values({
					organizationId: input.organizationId,
					machineId: input.machineId,
					triggeredByUserId: ctx.userId,
					targetVersion: input.targetVersion ?? null,
					outcome: "dispatched",
				})
				.returning({ id: hostUpdateAudit.id });
			if (!auditRow) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to write audit row",
				});
			}

			const jwt = await mintUserJwt({
				userId: ctx.userId,
				email: ctx.email,
				organizationIds: [input.organizationId],
				scope: "host-update",
				ttlSeconds: 60,
			});

			const routingKey = buildHostRoutingKey(
				input.organizationId,
				input.machineId,
			);

			try {
				const result = await relayMutation<
					HostUpdateRpcInput,
					HostUpdateRpcOutput
				>(
					{
						relayUrl: env.RELAY_URL,
						hostId: routingKey,
						jwt,
						timeoutMs: SUPERVISOR_DISPATCH_TIMEOUT_MS,
					},
					"host.update.start",
					{ targetVersion: input.targetVersion ?? null },
				);

				await dbWs
					.update(hostUpdateAudit)
					.set({
						outcome: result.outcome,
						previousVersion: result.previousVersion,
						newVersion: result.newVersion,
					})
					.where(eq(hostUpdateAudit.id, auditRow.id));

				return result;
			} catch (error) {
				await dbWs
					.update(hostUpdateAudit)
					.set({ outcome: "failed" })
					.where(eq(hostUpdateAudit.id, auditRow.id));

				if (error instanceof RelayDispatchError) {
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: `Host did not accept update: ${error.message}`,
						cause: error,
					});
				}
				throw error;
			}
		}),

	/**
	 * Called by a freshly-respawned daemon when it finds a `last-update.json`
	 * file written by the supervisor. Flips the most recent `dispatched` audit
	 * row in the last 15 minutes to `updated` or `failed`.
	 *
	 * Caller must be a host owner (same gate as initial trigger). The daemon
	 * authenticates via the same session token it always uses, so its JWT
	 * carries the owner's identity.
	 *
	 * Doesn't overwrite immutable dispatch-time fields (targetVersion,
	 * previousVersion). Only fills in newVersion (if missing) and writes
	 * errorMessage on failure.
	 */
	reportUpdate: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				succeeded: z.boolean(),
				finalVersion: z.string().regex(SEMVER_RE).optional(),
				error: z.string().max(1000).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const [link] = await db
				.select({ role: v2UsersHosts.role })
				.from(v2UsersHosts)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						eq(v2UsersHosts.organizationId, input.organizationId),
						eq(v2UsersHosts.hostId, input.machineId),
						eq(v2UsersHosts.role, "owner"),
					),
				)
				.limit(1);
			if (!link) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only host owners can report update outcomes",
				});
			}

			const [recent] = await db
				.select({
					id: hostUpdateAudit.id,
					newVersion: hostUpdateAudit.newVersion,
				})
				.from(hostUpdateAudit)
				.where(
					and(
						eq(hostUpdateAudit.organizationId, input.organizationId),
						eq(hostUpdateAudit.machineId, input.machineId),
						eq(hostUpdateAudit.outcome, "dispatched"),
						gt(hostUpdateAudit.requestedAt, new Date(Date.now() - 15 * 60_000)),
					),
				)
				.orderBy(desc(hostUpdateAudit.requestedAt))
				.limit(1);

			if (!recent) {
				return { matched: false as const };
			}

			await dbWs
				.update(hostUpdateAudit)
				.set({
					outcome: input.succeeded ? "updated" : "failed",
					newVersion:
						input.succeeded && !recent.newVersion
							? (input.finalVersion ?? null)
							: recent.newVersion,
					errorMessage: input.error ?? null,
				})
				.where(eq(hostUpdateAudit.id, recent.id));

			return { matched: true as const, auditId: recent.id };
		}),
} satisfies TRPCRouterRecord;
