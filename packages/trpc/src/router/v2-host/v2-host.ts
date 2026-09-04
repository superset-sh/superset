import { mintUserJwt } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import { v2UsersHostRoleValues } from "@superset/db/enums";
import { members, v2Hosts, v2UsersHosts } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { fetchRelayPresence } from "../../lib/relay-presence";
import { protectedProcedure, userError } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";

async function requireHostOwner(
	userId: string,
	machineId: string,
	organizationId: string,
) {
	const host = await db.query.v2Hosts.findFirst({
		where: and(
			eq(v2Hosts.organizationId, organizationId),
			eq(v2Hosts.machineId, machineId),
		),
		columns: { machineId: true, organizationId: true, createdByUserId: true },
	});

	if (!host) {
		throw userError({
			code: "NOT_FOUND",
			message: "Host not found in this organization",
			i18nKey: "serverError.v2Host.hostNotFoundInThisOrganization",
		});
	}

	const access = await db.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, organizationId),
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, machineId),
		),
		columns: { role: true },
	});

	if (!access || access.role !== "owner") {
		throw userError({
			code: "FORBIDDEN",
			message: "Only host owners can change membership",
			i18nKey: "serverError.v2Host.onlyHostOwnersCanChangeMembership",
		});
	}

	return host;
}

async function requireOrgMember(userId: string, organizationId: string) {
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, organizationId),
		),
		columns: { id: true },
	});

	if (!member) {
		throw userError({
			code: "BAD_REQUEST",
			message: "User is not a member of this organization",
			i18nKey: "serverError.v2Host.userIsNotAMember",
		});
	}
}

export const v2HostRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = requireActiveOrgId(ctx);
		const rows = await db
			.select({
				machineId: v2Hosts.machineId,
				name: v2Hosts.name,
				organizationId: v2Hosts.organizationId,
			})
			.from(v2Hosts)
			.innerJoin(
				v2UsersHosts,
				and(
					eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
					eq(v2UsersHosts.hostId, v2Hosts.machineId),
				),
			)
			.where(
				and(
					eq(v2Hosts.organizationId, organizationId),
					eq(v2UsersHosts.userId, ctx.session.user.id),
				),
			);

		// The relay's Durable Objects are the presence authority. Session
		// callers hold no relay JWT, so mint a short one for the lookup.
		const jwt = await mintUserJwt({
			userId: ctx.session.user.id,
			organizationIds: [organizationId],
			scope: "host-presence",
			ttlSeconds: 60,
		});
		const presence = await fetchRelayPresence(
			env.RELAY_URL,
			jwt,
			rows.map((row) => buildHostRoutingKey(row.organizationId, row.machineId)),
		);
		return rows.map((row) => ({
			...row,
			isOnline:
				presence?.[buildHostRoutingKey(row.organizationId, row.machineId)]
					?.online ?? false,
		}));
	}),

	listMembers: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				hostId: v2UsersHosts.hostId,
				userId: v2UsersHosts.userId,
				role: v2UsersHosts.role,
				createdAt: v2UsersHosts.createdAt,
			})
			.from(v2UsersHosts)
			.where(eq(v2UsersHosts.organizationId, organizationId));
	}),

	rename: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				name: z
					.string()
					.max(120)
					.transform((value) => value.trim())
					.pipe(z.string().min(1, "Host name cannot be empty")),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await requireHostOwner(ctx.session.user.id, input.hostId, organizationId);

			const txid = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Hosts)
					.set({ name: input.name })
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							eq(v2Hosts.machineId, input.hostId),
						),
					)
					.returning({ machineId: v2Hosts.machineId });
				if (!updated) {
					throw userError({
						code: "NOT_FOUND",
						message: "Host not found in this organization",
						i18nKey: "serverError.v2Host.hostNotFoundInThisOrganization",
					});
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	delete: protectedProcedure
		.input(z.object({ hostId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);

			const txid = await dbWs.transaction(async (tx) => {
				const [membership] = await tx
					.select({ id: members.id })
					.from(members)
					.where(
						and(
							eq(members.userId, ctx.session.user.id),
							eq(members.organizationId, organizationId),
						),
					)
					.limit(1)
					.for("update");

				if (!membership) {
					throw userError({
						code: "FORBIDDEN",
						message: "Not a member of this organization",
						i18nKey: "serverError.v2Host.notAMemberOfThisOrganization",
					});
				}

				const [host] = await tx
					.select({ machineId: v2Hosts.machineId })
					.from(v2Hosts)
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							eq(v2Hosts.machineId, input.hostId),
						),
					)
					.limit(1)
					.for("update");

				if (!host) {
					throw userError({
						code: "NOT_FOUND",
						message: "Host not found in this organization",
						i18nKey: "serverError.v2Host.hostNotFoundInThisOrganization",
					});
				}

				const [access] = await tx
					.select({ role: v2UsersHosts.role })
					.from(v2UsersHosts)
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, ctx.session.user.id),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					)
					.limit(1)
					.for("update");

				if (!access || access.role !== "owner") {
					throw userError({
						code: "FORBIDDEN",
						message: "Only host owners can delete this host",
						i18nKey: "serverError.v2Host.onlyHostOwnersCanDelete",
					});
				}

				const [deleted] = await tx
					.delete(v2Hosts)
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							eq(v2Hosts.machineId, input.hostId),
						),
					)
					.returning({ machineId: v2Hosts.machineId });

				if (!deleted) {
					throw userError({
						code: "NOT_FOUND",
						message: "Host not found in this organization",
						i18nKey: "serverError.v2Host.hostNotFoundInThisOrganization",
					});
				}

				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
				role: z.enum(v2UsersHostRoleValues).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await requireHostOwner(ctx.session.user.id, input.hostId, organizationId);
			await requireOrgMember(input.userId, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(v2UsersHosts)
					.values({
						organizationId,
						userId: input.userId,
						hostId: input.hostId,
						role: input.role ?? "member",
					})
					.onConflictDoNothing({
						target: [
							v2UsersHosts.organizationId,
							v2UsersHosts.userId,
							v2UsersHosts.hostId,
						],
					})
					.returning();
				const txid = await getCurrentTxid(tx);
				return { inserted, txid };
			});

			if (!result.inserted) {
				throw userError({
					code: "CONFLICT",
					message: "User already has access to this host",
					i18nKey: "serverError.v2Host.userAlreadyHasAccess",
				});
			}

			return { ...result.inserted, txid: result.txid };
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const host = await requireHostOwner(
				ctx.session.user.id,
				input.hostId,
				organizationId,
			);

			if (host.createdByUserId === input.userId) {
				throw userError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and can't be removed.",
					i18nKey: "serverError.v2Host.thisUserRunsTheHostService",
				});
			}

			const txid = await dbWs.transaction(async (tx) => {
				const target = await tx.query.v2UsersHosts.findFirst({
					where: and(
						eq(v2UsersHosts.organizationId, organizationId),
						eq(v2UsersHosts.userId, input.userId),
						eq(v2UsersHosts.hostId, input.hostId),
					),
					columns: { role: true },
				});

				if (!target) {
					return null;
				}

				if (target.role === "owner") {
					const otherOwners = await tx
						.select({ userId: v2UsersHosts.userId })
						.from(v2UsersHosts)
						.where(
							and(
								eq(v2UsersHosts.organizationId, organizationId),
								eq(v2UsersHosts.hostId, input.hostId),
								eq(v2UsersHosts.role, "owner"),
								ne(v2UsersHosts.userId, input.userId),
							),
						)
						.for("update");
					if (otherOwners.length === 0) {
						throw userError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
							i18nKey: "serverError.v2Host.aHostMustHaveAtLeast",
						});
					}
				}

				const [deleted] = await tx
					.delete(v2UsersHosts)
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					)
					.returning({ userId: v2UsersHosts.userId });
				if (!deleted) {
					return null;
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	setMemberRole: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
				role: z.enum(v2UsersHostRoleValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const host = await requireHostOwner(
				ctx.session.user.id,
				input.hostId,
				organizationId,
			);

			if (input.role === "member" && host.createdByUserId === input.userId) {
				throw userError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and must remain an owner.",
					i18nKey: "serverError.v2Host.thisUserRunsTheHostService2",
				});
			}

			const txid = await dbWs.transaction(async (tx) => {
				const target = await tx.query.v2UsersHosts.findFirst({
					where: and(
						eq(v2UsersHosts.organizationId, organizationId),
						eq(v2UsersHosts.userId, input.userId),
						eq(v2UsersHosts.hostId, input.hostId),
					),
					columns: { role: true },
				});

				if (!target) {
					throw userError({
						code: "NOT_FOUND",
						message: "User is not a member of this host",
						i18nKey: "serverError.v2Host.userIsNotAMemberOf2",
					});
				}

				if (input.role === "member" && target.role === "owner") {
					const otherOwners = await tx
						.select({ userId: v2UsersHosts.userId })
						.from(v2UsersHosts)
						.where(
							and(
								eq(v2UsersHosts.organizationId, organizationId),
								eq(v2UsersHosts.hostId, input.hostId),
								eq(v2UsersHosts.role, "owner"),
								ne(v2UsersHosts.userId, input.userId),
							),
						)
						.for("update");
					if (otherOwners.length === 0) {
						throw userError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
							i18nKey: "serverError.v2Host.aHostMustHaveAtLeast",
						});
					}
				}

				const [updated] = await tx
					.update(v2UsersHosts)
					.set({ role: input.role })
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					)
					.returning({ userId: v2UsersHosts.userId });
				if (!updated) {
					throw userError({
						code: "NOT_FOUND",
						message: "User is not a member of this host",
						i18nKey: "serverError.v2Host.userIsNotAMemberOf2",
					});
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),
} satisfies TRPCRouterRecord;
