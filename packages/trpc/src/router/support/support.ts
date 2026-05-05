import { db } from "@superset/db/client";
import { submittedPrompts } from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../../env";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

const resend = new Resend(env.RESEND_API_KEY);
const SUPPORT_EMAIL = COMPANY.MAIL_TO.replace(/^mailto:/, "");
const supportReportRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(3, "1 h"),
				prefix: "ratelimit:support:migration-report",
			})
		: null;

const submitPromptRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(5, "1 h"),
				prefix: "ratelimit:support:submit-prompt",
			})
		: null;

async function assertSupportReportRateLimit({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string | null | undefined;
}) {
	if (!supportReportRateLimit) {
		if (env.NODE_ENV === "production") {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Support rate limiting is not configured",
			});
		}
		console.warn(
			"[support/sendMigrationReport] rate limit skipped because KV is not configured",
		);
		return;
	}

	const { success } = await supportReportRateLimit.limit(
		`${organizationId ?? "no-org"}:${userId}`,
	);
	if (!success) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many support reports. Try again later.",
		});
	}
}

async function assertSubmitPromptRateLimit({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string | null | undefined;
}) {
	if (!submitPromptRateLimit) {
		if (env.NODE_ENV === "production") {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Submit prompt rate limiting is not configured",
			});
		}
		console.warn(
			"[support/submitPrompt] rate limit skipped because KV is not configured",
		);
		return;
	}

	const { success } = await submitPromptRateLimit.limit(
		`${organizationId ?? "no-org"}:${userId}`,
	);
	if (!success) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many prompt submissions. Try again later.",
		});
	}
}

function sanitizeEmailBodyLine(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

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
			const safeName = user.name ? sanitizeEmailBodyLine(user.name) : "";
			const userLabel = safeName ? `${safeName} <${user.email}>` : user.email;

			await assertSupportReportRateLimit({
				userId: user.id,
				organizationId,
			});

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

	submitPrompt: protectedProcedure
		.input(
			z.object({
				promptText: z.string().min(1).max(10_000),
				submitterName: z.string().max(120).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const organizationId = ctx.activeOrganizationId ?? null;

			await assertSubmitPromptRateLimit({ userId, organizationId });

			try {
				await db.insert(submittedPrompts).values({
					userId,
					organizationId,
					promptText: input.promptText,
					submitterName: input.submitterName?.trim() || null,
				});
			} catch (error) {
				console.error("[support/submitPrompt] failed", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to save prompt",
				});
			}
		}),
});
