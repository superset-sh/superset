import { db } from "@superset/db/client";
import { environmentSecrets, users } from "@superset/db/schema";
import {
	MAX_TOTAL_SIZE,
	validateSecretKey,
	validateSecretValue,
} from "@superset/shared/environment-secrets";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, ne, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { assertInternal } from "../../../lib/cloud-guards";
import { jwtProcedure, userError } from "../../../trpc";
import { loadEnvironment, secretOwnerOrganizationId } from "../environment";
import { decryptSecret, encryptSecret } from "./utils/crypto";

export const secretsRouter = {
	list: jwtProcedure
		.input(z.object({ environmentId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			const environment = await loadEnvironment(
				input.environmentId,
				ctx.organizationIds,
			);
			const organizationId = secretOwnerOrganizationId(
				environment,
				ctx.activeOrganizationId,
			);
			const rows = await db
				.select({
					id: environmentSecrets.id,
					key: environmentSecrets.key,
					sensitive: environmentSecrets.sensitive,
					updatedAt: environmentSecrets.updatedAt,
				})
				.from(environmentSecrets)
				.where(
					and(
						eq(environmentSecrets.environmentId, input.environmentId),
						eq(environmentSecrets.organizationId, organizationId),
					),
				)
				.orderBy(asc(environmentSecrets.key));
			return rows;
		}),

	getDecrypted: jwtProcedure
		.input(z.object({ environmentId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			const environment = await loadEnvironment(
				input.environmentId,
				ctx.organizationIds,
			);
			const organizationId = secretOwnerOrganizationId(
				environment,
				ctx.activeOrganizationId,
			);
			const rows = await db
				.select({
					id: environmentSecrets.id,
					key: environmentSecrets.key,
					encryptedValue: environmentSecrets.encryptedValue,
					sensitive: environmentSecrets.sensitive,
					createdAt: environmentSecrets.createdAt,
					updatedAt: environmentSecrets.updatedAt,
					createdById: users.id,
					createdByName: users.name,
					createdByImage: users.image,
				})
				.from(environmentSecrets)
				.leftJoin(users, eq(users.id, environmentSecrets.createdByUserId))
				.where(
					and(
						eq(environmentSecrets.environmentId, input.environmentId),
						eq(environmentSecrets.organizationId, organizationId),
					),
				)
				.orderBy(asc(environmentSecrets.key));
			return rows.map((row) => ({
				id: row.id,
				key: row.key,
				value: row.sensitive
					? ""
					: decryptSecret(row.encryptedValue, {
							environmentId: input.environmentId,
							organizationId,
							key: row.key,
						}),
				sensitive: row.sensitive,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				createdBy: row.createdById
					? {
							id: row.createdById,
							name: row.createdByName ?? "",
							image: row.createdByImage ?? null,
						}
					: null,
			}));
		}),

	set: jwtProcedure
		.input(
			z.object({
				environmentId: z.string().uuid(),
				key: z.string().min(1),
				value: z.string(),
				sensitive: z.boolean().default(true),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			const environment = await loadEnvironment(
				input.environmentId,
				ctx.organizationIds,
			);

			const keyCheck = validateSecretKey(input.key);
			if (!keyCheck.valid) {
				throw userError({
					code: "BAD_REQUEST",
					message: keyCheck.error,
					i18nKey: "serverError.environment.invalidSecretKey",
				});
			}
			const valueCheck = validateSecretValue(input.value);
			if (!valueCheck.valid) {
				throw userError({
					code: "BAD_REQUEST",
					message: valueCheck.error,
					i18nKey: "serverError.environment.invalidSecretValue",
				});
			}

			const organizationId = secretOwnerOrganizationId(
				environment,
				ctx.activeOrganizationId,
			);

			const [stored] = await db
				.select({
					bytes: sum(sql`length(${environmentSecrets.encryptedValue})`),
				})
				.from(environmentSecrets)
				.where(
					and(
						eq(environmentSecrets.environmentId, input.environmentId),
						eq(environmentSecrets.organizationId, organizationId),
						ne(environmentSecrets.key, input.key),
					),
				);
			const used = Number(stored?.bytes ?? 0);
			if (used + Buffer.byteLength(input.value) > MAX_TOTAL_SIZE) {
				throw userError({
					code: "BAD_REQUEST",
					message: `Variables for this environment must total under ${MAX_TOTAL_SIZE / 1024}KB`,
					i18nKey: "serverError.environment.secretsTooLarge",
				});
			}

			await db
				.insert(environmentSecrets)
				.values({
					organizationId,
					environmentId: input.environmentId,
					key: input.key,
					encryptedValue: encryptSecret(input.value, {
						environmentId: input.environmentId,
						organizationId,
						key: input.key,
					}),
					sensitive: input.sensitive,
					createdByUserId: ctx.userId,
				})
				.onConflictDoUpdate({
					target: [
						environmentSecrets.environmentId,
						environmentSecrets.organizationId,
						environmentSecrets.key,
					],
					set: {
						encryptedValue: encryptSecret(input.value, {
							environmentId: input.environmentId,
							organizationId,
							key: input.key,
						}),
						sensitive: input.sensitive,
					},
				});
			return { key: input.key };
		}),

	remove: jwtProcedure
		.input(
			z.object({ environmentId: z.string().uuid(), key: z.string().min(1) }),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			const environment = await loadEnvironment(
				input.environmentId,
				ctx.organizationIds,
			);
			const organizationId = secretOwnerOrganizationId(
				environment,
				ctx.activeOrganizationId,
			);
			await db
				.delete(environmentSecrets)
				.where(
					and(
						eq(environmentSecrets.environmentId, input.environmentId),
						eq(environmentSecrets.organizationId, organizationId),
						eq(environmentSecrets.key, input.key),
					),
				);
			return { removed: true };
		}),
} satisfies TRPCRouterRecord;
