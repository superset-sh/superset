import { db, dbWs } from "@superset/db/client";
import { secrets } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../../integration/utils";
import { decryptSecret, encryptSecret } from "./utils/crypto";
import {
	MAX_SECRETS_PER_PROJECT,
	MAX_TOTAL_SIZE,
	validateSecretKey,
	validateSecretValue,
} from "./utils/secrets-validation";

export const secretsRouter = {
	upsert: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				organizationId: z.string().uuid(),
				key: z.string(),
				value: z.string(),
				sensitive: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const keyValidation = validateSecretKey(input.key);
			if (!keyValidation.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: keyValidation.error,
				});
			}

			const valueValidation = validateSecretValue(input.value);
			if (!valueValidation.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: valueValidation.error,
				});
			}

			const existing = await db.query.secrets.findMany({
				where: and(
					eq(secrets.projectId, input.projectId),
					eq(secrets.organizationId, input.organizationId),
				),
			});

			const isUpdate = existing.some((s) => s.key === input.key);
			if (!isUpdate && existing.length >= MAX_SECRETS_PER_PROJECT) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Maximum of ${MAX_SECRETS_PER_PROJECT} secrets per project`,
				});
			}

			const encryptedValue = encryptSecret(input.value);

			const totalSize = existing.reduce((sum, s) => {
				if (s.key === input.key) return sum;
				return sum + s.encryptedValue.length;
			}, encryptedValue.length);

			if (totalSize > MAX_TOTAL_SIZE) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Total secrets size exceeds limit",
				});
			}

			const [result] = await dbWs
				.insert(secrets)
				.values({
					projectId: input.projectId,
					organizationId: input.organizationId,
					key: input.key,
					encryptedValue,
					sensitive: input.sensitive ?? false,
					createdByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [secrets.projectId, secrets.key],
					set: {
						encryptedValue,
						sensitive: input.sensitive ?? false,
					},
				})
				.returning();
			return result;
		}),

	delete: protectedProcedure
		.input(
			z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			await dbWs
				.delete(secrets)
				.where(
					and(
						eq(secrets.id, input.id),
						eq(secrets.organizationId, input.organizationId),
					),
				);
			return { success: true };
		}),

	getDecrypted: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const rows = await db.query.secrets.findMany({
				where: and(
					eq(secrets.projectId, input.projectId),
					eq(secrets.organizationId, input.organizationId),
				),
				with: {
					createdBy: { columns: { id: true, name: true, image: true } },
				},
			});
			return rows.map((row) => ({
				id: row.id,
				key: row.key,
				value: row.sensitive ? "" : decryptSecret(row.encryptedValue),
				sensitive: row.sensitive,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				createdBy: row.createdBy ?? null,
			}));
		}),
} satisfies TRPCRouterRecord;
