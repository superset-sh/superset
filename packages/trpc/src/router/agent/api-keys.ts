import { createHash, randomBytes } from "node:crypto";
import { db } from "@superset/db/client";
import { apiKeys } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

/**
 * Generate a secure random API key
 * Format: sk_live_<32 random bytes as base64url>
 */
function generateApiKey(): string {
	const bytes = randomBytes(32);
	return `sk_live_${bytes.toString("base64url")}`;
}

/**
 * Hash an API key for storage using SHA-256
 */
function hashApiKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

/**
 * Get a display prefix for an API key (first 7 + last 4 chars)
 * e.g., "sk_live...xyz1"
 */
function getKeyPrefix(key: string): string {
	return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export const apiKeysRouter = {
	/**
	 * Generate a new API key
	 * Returns the full key only once - it cannot be retrieved later
	 */
	generate: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				defaultDeviceId: z.string().optional(),
				expiresAt: z.string().datetime().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const userId = ctx.session.user.id;

			// Generate the key
			const plainKey = generateApiKey();
			const keyHash = hashApiKey(plainKey);
			const keyPrefix = getKeyPrefix(plainKey);

			// Store the key (hash only)
			const result = await db
				.insert(apiKeys)
				.values({
					userId,
					organizationId,
					name: input.name,
					keyPrefix,
					keyHash,
					defaultDeviceId: input.defaultDeviceId,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
				})
				.returning();

			const created = result[0];
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create API key",
				});
			}

			// Return the full key only this once
			return {
				id: created.id,
				name: created.name,
				key: plainKey, // Only returned on creation!
				keyPrefix: created.keyPrefix,
				createdAt: created.createdAt,
				expiresAt: created.expiresAt,
			};
		}),

	/**
	 * List all API keys for the current user in the active organization
	 * Does NOT return the actual keys (only prefix for identification)
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.session.activeOrganizationId;
		if (!organizationId) {
			return [];
		}

		const userId = ctx.session.user.id;

		const keys = await db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				keyPrefix: apiKeys.keyPrefix,
				defaultDeviceId: apiKeys.defaultDeviceId,
				lastUsedAt: apiKeys.lastUsedAt,
				usageCount: apiKeys.usageCount,
				createdAt: apiKeys.createdAt,
				expiresAt: apiKeys.expiresAt,
			})
			.from(apiKeys)
			.where(
				and(
					eq(apiKeys.userId, userId),
					eq(apiKeys.organizationId, organizationId),
					isNull(apiKeys.revokedAt), // Only non-revoked keys
				),
			)
			.orderBy(apiKeys.createdAt);

		return keys;
	}),

	/**
	 * Revoke an API key (soft delete)
	 */
	revoke: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			// Verify ownership and revoke
			const [revoked] = await db
				.update(apiKeys)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(apiKeys.id, input.id),
						eq(apiKeys.userId, userId),
						isNull(apiKeys.revokedAt),
					),
				)
				.returning({ id: apiKeys.id });

			if (!revoked) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "API key not found or already revoked",
				});
			}

			return { success: true, revokedAt: new Date() };
		}),

	/**
	 * Update an API key (name, default device)
	 */
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				defaultDeviceId: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			const updates: Partial<{
				name: string;
				defaultDeviceId: string | null;
			}> = {};

			if (input.name !== undefined) {
				updates.name = input.name;
			}
			if (input.defaultDeviceId !== undefined) {
				updates.defaultDeviceId = input.defaultDeviceId;
			}

			if (Object.keys(updates).length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No updates provided",
				});
			}

			const [updated] = await db
				.update(apiKeys)
				.set(updates)
				.where(
					and(
						eq(apiKeys.id, input.id),
						eq(apiKeys.userId, userId),
						isNull(apiKeys.revokedAt),
					),
				)
				.returning();

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "API key not found or already revoked",
				});
			}

			return {
				id: updated.id,
				name: updated.name,
				keyPrefix: updated.keyPrefix,
				defaultDeviceId: updated.defaultDeviceId,
			};
		}),
} satisfies TRPCRouterRecord;
