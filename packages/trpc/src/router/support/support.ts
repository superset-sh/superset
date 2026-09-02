import { db } from "@superset/db/client";
import {
	organizations,
	submittedPrompts,
	subscriptions,
	users,
} from "@superset/db/schema";
import { FeedbackReportEmail } from "@superset/email/emails/feedback-report";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import { createTRPCRouter, protectedProcedure, userError } from "../../trpc";

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

const submitFeedbackRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(5, "1 h"),
				prefix: "ratelimit:support:submit-feedback",
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
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Support rate limiting is not configured",
				i18nKey: "serverError.support.supportRateLimitingIsNotConfigured",
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
		throw userError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many support reports. Try again later.",
			i18nKey: "serverError.support.tooManySupportReportsTryAgain",
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
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Submit prompt rate limiting is not configured",
				i18nKey: "serverError.support.submitPromptRateLimitingIsNot",
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
		throw userError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many prompt submissions. Try again later.",
			i18nKey: "serverError.support.tooManyPromptSubmissionsTryAgain",
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
				const { error } = await resend.emails.send({
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
				if (error) throw error;
			} catch (error) {
				console.error("[support/sendMigrationReport] failed", error);
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send migration report",
					i18nKey: "serverError.support.failedToSendMigrationReport",
				});
			}
		}),

	submitFeedback: protectedProcedure
		.input(
			z
				.object({
					type: z.enum(["bug", "feature", "general"]),
					title: z.string().min(1).max(200),
					body: z.string().min(1).max(20_000),
					appVersion: z.string().max(100).optional(),
					os: z.string().max(200).optional(),
					attachments: z
						.array(
							z.object({
								filename: z.string().min(1).max(200),
								contentBase64: z.string().min(1),
							}),
						)
						.max(5)
						.optional(),
				})
				.refine(
					(value) =>
						(value.attachments ?? []).reduce(
							(total, attachment) => total + attachment.contentBase64.length,
							0,
						) <= 14_000_000,
					{ message: "Attachments exceed the 10MB total limit" },
				),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId ?? null;
			const user = ctx.session.user;

			if (!submitFeedbackRateLimit) {
				if (env.NODE_ENV === "production") {
					throw userError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Feedback rate limiting is not configured",
						i18nKey: "serverError.support.feedbackRateLimitingIsNotConfigured",
					});
				}
				console.warn(
					"[support/submitFeedback] rate limit skipped because KV is not configured",
				);
			} else {
				const { success } = await submitFeedbackRateLimit.limit(
					`${organizationId ?? "no-org"}:${user.id}`,
				);
				if (!success) {
					throw userError({
						code: "TOO_MANY_REQUESTS",
						message: "Too many feedback submissions. Try again later.",
						i18nKey: "serverError.support.tooManyFeedbackSubmissionsTryAgain",
					});
				}
			}

			// Identity is derived server-side from the authenticated session so
			// reports arrive attributed and can't be spoofed by the client.
			const [orgRow, subscriptionRow, userRow] = await Promise.all([
				organizationId
					? db.query.organizations.findFirst({
							where: eq(organizations.id, organizationId),
							columns: { name: true, createdAt: true },
						})
					: Promise.resolve(undefined),
				organizationId
					? db.query.subscriptions.findFirst({
							where: and(
								eq(subscriptions.referenceId, organizationId),
								inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
							),
							columns: { plan: true, status: true },
						})
					: Promise.resolve(undefined),
				db.query.users.findFirst({
					where: eq(users.id, user.id),
					columns: { createdAt: true },
				}),
			]);

			const safeName = user.name ? sanitizeEmailBodyLine(user.name) : "";
			const planLabel = subscriptionRow
				? `${subscriptionRow.plan} (${subscriptionRow.status})`
				: "free (no active subscription)";
			const safeTitle = sanitizeEmailBodyLine(input.title);

			// Strip anything path-like so a crafted filename can't smuggle headers
			// or directory segments into the outgoing email.
			const attachments = input.attachments?.map((attachment) => ({
				filename:
					attachment.filename.replace(/[/\\\s]+/g, "_").slice(0, 200) ||
					"attachment",
				content: attachment.contentBase64,
			}));

			try {
				// Resend reports API failures via the resolved `error` field, not by
				// throwing — without this check a rejected email would "succeed".
				const { error } = await resend.emails.send({
					from: "Superset <noreply@superset.sh>",
					to: SUPPORT_EMAIL,
					// CC the reporter so they keep a copy and stay on the thread.
					cc: user.email,
					replyTo: user.email,
					subject: `[Feedback: ${input.type}] ${safeTitle}`,
					attachments,
					react: FeedbackReportEmail({
						type: input.type,
						title: safeTitle,
						body: input.body,
						userName: safeName || undefined,
						userEmail: user.email,
						userId: user.id,
						accountCreated: userRow?.createdAt?.toISOString(),
						organizationName: orgRow
							? sanitizeEmailBodyLine(orgRow.name)
							: undefined,
						organizationId: organizationId ?? undefined,
						plan: planLabel,
						appVersion: input.appVersion
							? sanitizeEmailBodyLine(input.appVersion)
							: undefined,
						os: input.os ? sanitizeEmailBodyLine(input.os) : undefined,
					}),
				});
				if (error) throw error;
			} catch (error) {
				console.error("[support/submitFeedback] failed", error);
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send feedback",
					i18nKey: "serverError.support.failedToSendFeedback",
				});
			}

			posthog.capture({
				distinctId: user.id,
				event: "feedback_submitted",
				properties: {
					type: input.type,
					plan: planLabel,
					organization_id: organizationId,
					attachment_count: input.attachments?.length ?? 0,
					app_version: input.appVersion ?? null,
				},
			});
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
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to save prompt",
					i18nKey: "serverError.support.failedToSavePrompt",
				});
			}
		}),
});
