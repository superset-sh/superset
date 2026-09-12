import { db } from "@superset/db/client";
import {
	v2LiveActivityTokenKindEnum,
	v2LiveActivityTokens,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { deleteTokensForUser, pushCardForUser } from "../../lib/live-activity";
import { jwtProcedure, userError } from "../../trpc";

const labelsSchema = z.object({
	working: z.string().min(1),
	review: z.string().min(1),
	permission: z.string().min(1),
	failed: z.string().min(1),
	more: z.string().min(1),
});

const APNS_TOKEN = z.string().regex(/^[0-9a-f]{32,200}$/i);

export const mobileRouter = {
	liveActivity: {
		/**
		 * A phone hands over an Apple push token for the Lock Screen card,
		 * together with the words the card should show in its language. A
		 * fresh `update` token gets the current fleet pushed right away so the
		 * card is never blank while it waits for the next transition.
		 */
		registerToken: jwtProcedure
			.input(
				z.object({
					kind: v2LiveActivityTokenKindEnum,
					token: APNS_TOKEN,
					activityId: z.string().min(1).optional(),
					labels: labelsSchema,
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const organizationId = ctx.activeOrganizationId;
				if (!organizationId) {
					throw userError({
						code: "BAD_REQUEST",
						message: "No active organization",
						i18nKey: "serverError.billing.noActiveOrganization",
					});
				}
				await db
					.insert(v2LiveActivityTokens)
					.values({
						userId: ctx.userId,
						organizationId,
						kind: input.kind,
						token: input.token.toLowerCase(),
						activityId: input.activityId ?? null,
						labels: input.labels,
					})
					.onConflictDoUpdate({
						target: v2LiveActivityTokens.token,
						set: {
							userId: ctx.userId,
							organizationId,
							kind: input.kind,
							activityId: input.activityId ?? null,
							labels: input.labels,
						},
					});
				if (input.kind === "update") {
					waitUntil(
						pushCardForUser({
							organizationId,
							userId: ctx.userId,
							priority: 5,
						}).catch((error) => {
							console.warn(
								"[live-activity] push after register failed:",
								error,
							);
						}),
					);
				}
				return { ok: true as const };
			}),

		releaseToken: jwtProcedure
			.input(z.object({ token: APNS_TOKEN }))
			.mutation(async ({ ctx, input }) => {
				if (!ctx.activeOrganizationId) return { ok: true as const };
				await deleteTokensForUser(ctx.activeOrganizationId, ctx.userId, [
					input.token.toLowerCase(),
				]);
				return { ok: true as const };
			}),
	},
} satisfies TRPCRouterRecord;
