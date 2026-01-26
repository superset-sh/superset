import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const apiKeysRouter = {
	/**
	 * Generate a new API key using Better Auth's apiKey plugin
	 * Returns the full key only once - it cannot be retrieved later
	 */
	generate: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				defaultDeviceId: z.string().optional(),
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

			// Create API key using Better Auth's API with metadata containing org context
			const apiKey = await ctx.auth.api.createApiKey({
				body: {
					name: input.name,
					userId, // Required for server-side creation
					metadata: JSON.stringify({
						organizationId,
						defaultDeviceId: input.defaultDeviceId ?? null,
					}),
					rateLimitEnabled: false, // Disable rate limiting per plan
				},
			});

			// Return the full key only this once
			// Better Auth returns 'start' as the key prefix, 'key' is the full value
			return {
				id: apiKey.id,
				name: apiKey.name ?? input.name,
				key: apiKey.key, // Only returned on creation!
				keyPrefix:
					apiKey.start ?? `${apiKey.key.slice(0, 7)}...${apiKey.key.slice(-4)}`,
				createdAt: apiKey.createdAt,
				expiresAt: apiKey.expiresAt ?? null,
			};
		}),

	/**
	 * List all API keys for the current user in the active organization
	 * Uses Better Auth's listApiKeys and filters by organization metadata
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.session.activeOrganizationId;
		if (!organizationId) {
			return [];
		}

		// Get all API keys for the current user via Better Auth
		const allKeys = await ctx.auth.api.listApiKeys({
			headers: ctx.headers,
		});

		// Filter to only show keys for current organization (from metadata)
		const orgKeys = allKeys.filter((key) => {
			if (!key.metadata) return false;
			try {
				const meta =
					typeof key.metadata === "string"
						? JSON.parse(key.metadata)
						: key.metadata;
				return meta.organizationId === organizationId;
			} catch {
				return false;
			}
		});

		// Map to response shape expected by UI
		return orgKeys.map((key) => {
			let defaultDeviceId: string | null = null;
			if (key.metadata) {
				try {
					const meta =
						typeof key.metadata === "string"
							? JSON.parse(key.metadata)
							: key.metadata;
					defaultDeviceId = meta.defaultDeviceId ?? null;
				} catch {
					// Ignore parse errors
				}
			}

			return {
				id: key.id,
				name: key.name ?? "Unnamed Key",
				keyPrefix: key.start ?? "sk_live_...",
				defaultDeviceId,
				lastUsedAt: key.lastRequest ?? null,
				usageCount: String(key.requestCount ?? 0),
				createdAt: key.createdAt,
				expiresAt: key.expiresAt ?? null,
			};
		});
	}),

	/**
	 * Revoke an API key using Better Auth's deleteApiKey
	 */
	revoke: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			// Better Auth's deleteApiKey verifies ownership via session
			const result = await ctx.auth.api.deleteApiKey({
				body: { keyId: input.id },
				headers: ctx.headers,
			});

			if (!result.success) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "API key not found or already revoked",
				});
			}

			return { success: true, revokedAt: new Date() };
		}),
} satisfies TRPCRouterRecord;
