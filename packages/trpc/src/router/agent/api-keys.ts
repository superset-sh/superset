import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const apiKeysRouter = {
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

			const apiKey = await ctx.auth.api.createApiKey({
				body: {
					name: input.name,
					userId,
					metadata: JSON.stringify({
						organizationId,
						defaultDeviceId: input.defaultDeviceId ?? null,
					}),
					rateLimitEnabled: false,
				},
			});

			return {
				id: apiKey.id,
				name: apiKey.name ?? input.name,
				key: apiKey.key,
				keyPrefix:
					apiKey.start ?? `${apiKey.key.slice(0, 7)}...${apiKey.key.slice(-4)}`,
				createdAt: apiKey.createdAt,
				expiresAt: apiKey.expiresAt ?? null,
			};
		}),

	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.session.activeOrganizationId;
		if (!organizationId) {
			return [];
		}

		const allKeys = await ctx.auth.api.listApiKeys({
			headers: ctx.headers,
		});

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

		return orgKeys.map((key) => {
			let defaultDeviceId: string | null = null;
			if (key.metadata) {
				try {
					const meta =
						typeof key.metadata === "string"
							? JSON.parse(key.metadata)
							: key.metadata;
					defaultDeviceId = meta.defaultDeviceId ?? null;
				} catch {}
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

	revoke: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
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
