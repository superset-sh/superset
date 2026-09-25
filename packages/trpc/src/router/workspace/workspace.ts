// Workspaces are host-owned; the cloud only hears about creations, for the
// activation email campaign.
import { db } from "@superset/db/client";
import { v2WorkspaceTypeValues } from "@superset/db/enums";
import { users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../../env";
import { jwtProcedure, userError } from "../../trpc";

const resend = new Resend(env.RESEND_API_KEY);
const ACTIVATION_EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Emits `user.activated`, the exit condition of the Resend activation email
// automation — a user who created a real workspace stops receiving nudges.
async function exitActivationEmailCampaign(userId: string) {
	const user = await db.query.users.findFirst({
		columns: { createdAt: true, email: true },
		where: eq(users.id, userId),
	});
	const isRecentSignup =
		user && Date.now() - user.createdAt.getTime() < ACTIVATION_EVENT_WINDOW_MS;
	if (!isRecentSignup) return;

	const { error } = await resend.events.send({
		event: "user.activated",
		email: user.email,
		payload: { userId },
	});
	if (error) {
		console.error(
			`[workspace.trackCreated] Failed to emit activation event for ${userId}: ${error.message}`,
		);
	}
}

export const workspaceRouter = {
	trackCreated: jwtProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				organizationId: z.string().uuid(),
				projectId: z.string(),
				branch: z.string(),
				type: z.enum(v2WorkspaceTypeValues),
				hostId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
					i18nKey: "serverError.v2Workspace.notAMemberOfThisOrganization",
				});
			}

			if (input.type !== "main") {
				await exitActivationEmailCampaign(ctx.userId);
			}

			return { ok: true };
		}),
} satisfies TRPCRouterRecord;
