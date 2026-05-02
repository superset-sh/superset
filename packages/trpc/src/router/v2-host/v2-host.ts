import { db, dbWs } from "@superset/db/client";
import { v2UsersHostRoleValues } from "@superset/db/enums";
import { members, v2Hosts, v2UsersHosts } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgId } from "../utils/active-org";

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
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host not found in this organization",
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
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only host owners can change membership",
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
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "User is not a member of this organization",
		});
	}
}

export const v2HostRouter = {
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
				throw new TRPCError({
					code: "CONFLICT",
					message: "User already has access to this host",
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
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and can't be removed.",
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
					return await getCurrentTxid(tx);
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
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
						});
					}
				}

				await tx
					.delete(v2UsersHosts)
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					);
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
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and must remain an owner.",
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
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User is not a member of this host",
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
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
						});
					}
				}

				await tx
					.update(v2UsersHosts)
					.set({ role: input.role })
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					);
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),
} satisfies TRPCRouterRecord;
