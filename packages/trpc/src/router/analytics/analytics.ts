import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { posthog } from "../../lib/analytics";
import { fetchInsightResults } from "../../lib/posthog-client";
import { adminProcedure, protectedProcedure } from "../../trpc";
import { ADMIN_INSIGHT_KEYS, ADMIN_INSIGHTS } from "./insight-registry";

export const analyticsRouter = {
	captureEvent: protectedProcedure
		.input(
			z.object({
				source: z.string().min(1).max(50),
				event: z.string().min(1).max(200),
				properties: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const augmented = ctx.session.session as typeof ctx.session.session & {
				plan?: string | null;
			};
			posthog.capture({
				distinctId: ctx.session.user.id,
				event: input.event,
				properties: {
					...(input.properties ?? {}),
					source: input.source,
					plan: augmented.plan ?? null,
					active_organization_id: ctx.activeOrganizationId,
				},
				groups: ctx.activeOrganizationId
					? { organization: ctx.activeOrganizationId }
					: undefined,
			});
			return { ok: true };
		}),

	// Server-side feature-flag payload lookup for the authenticated user. Lets
	// clients without a PostHog SDK (e.g. the CLI binary) evaluate flags
	// without us baking the PostHog project key into their build. Returns
	// `null` when the flag is off or has no payload configured.
	featureFlagPayload: protectedProcedure
		.input(z.object({ key: z.string().min(1).max(100) }))
		.query(async ({ ctx, input }) => {
			try {
				const payload = await posthog.getFeatureFlagPayload(
					input.key,
					ctx.session.user.id,
				);
				return payload ?? null;
			} catch {
				return null;
			}
		}),

	getInsightResults: adminProcedure
		.input(z.object({ insight: z.enum(ADMIN_INSIGHT_KEYS) }))
		.query(({ input }) => fetchInsightResults(ADMIN_INSIGHTS[input.insight])),
} satisfies TRPCRouterRecord;
