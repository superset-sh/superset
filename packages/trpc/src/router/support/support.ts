import { COMPANY } from "@superset/shared/constants";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../../env";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

const resend = new Resend(env.RESEND_API_KEY);
const SUPPORT_EMAIL = COMPANY.MAIL_TO.replace(/^mailto:/, "");

export const supportRouter = createTRPCRouter({
	sendMigrationReport: protectedProcedure
		.input(
			z.object({
				report: z.string().min(1).max(20_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;
			const user = ctx.session.user;
			const userLabel = user.name ? `${user.name} <${user.email}>` : user.email;

			try {
				await resend.emails.send({
					from: "Superset <noreply@superset.sh>",
					to: SUPPORT_EMAIL,
					replyTo: user.email,
					subject: "Superset V1 to V2 migration issue",
					text: [
						`User: ${userLabel}`,
						`User ID: ${user.id}`,
						`Organization ID: ${organizationId ?? "none"}`,
						"",
						input.report,
					].join("\n"),
				});
			} catch (error) {
				console.error("[support/sendMigrationReport] failed", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send migration report",
				});
			}
		}),
});
