import { createHmac } from "node:crypto";
import { db } from "@superset/db/client";
import { pageReports, pages, pageVersions } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { env } from "../../env";
import { adminProcedure, publicProcedure, userError } from "../../trpc";
import {
	listPageReportsSchema,
	reportPageSchema,
	reviewPageReportSchema,
	takedownPageSchema,
} from "./schema";
import { writePageManifest } from "./storage";

const reportRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(5, "1 h"),
				prefix: "ratelimit:page:report",
			})
		: null;

function reporterIp(headers: Headers): string {
	return (
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		"unknown"
	);
}

function hashReporterIp(ip: string): string {
	return createHmac("sha256", env.USERCONTENT_TOKEN_SECRET)
		.update(ip)
		.digest("hex");
}

async function latestVersionNumber(pageId: string): Promise<number | null> {
	const [row] = await db
		.select({ version: pageVersions.version })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version))
		.limit(1);
	return row?.version ?? null;
}

async function enforceReportRateLimit(key: string): Promise<void> {
	if (!reportRateLimit) {
		if (env.NODE_ENV === "production") {
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Page report rate limiting is not configured",
				i18nKey: "serverError.page.reportRateLimitingIsNot",
			});
		}
		console.warn(
			"[page/report] rate limit skipped because KV is not configured",
		);
		return;
	}
	let success: boolean;
	try {
		({ success } = await reportRateLimit.limit(key));
	} catch (error) {
		console.error("[page/report] rate limiter unavailable:", error);
		throw userError({
			code: "SERVICE_UNAVAILABLE",
			message: "Reporting is briefly unavailable. Try again shortly.",
			i18nKey: "serverError.page.reportingIsBrieflyUnavailable",
		});
	}
	if (!success) {
		throw userError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many reports. Try again later.",
			i18nKey: "serverError.page.tooManyReportsTryAgainLater",
		});
	}
}

export const pageReportRouter = {
	report: publicProcedure
		.input(reportPageSchema)
		.mutation(async ({ ctx, input }) => {
			const ipHash = hashReporterIp(reporterIp(ctx.headers));
			await enforceReportRateLimit(ctx.session?.user.id ?? ipHash);

			const [page] = await db
				.select({
					id: pages.id,
					visibility: pages.visibility,
					sharedVersion: pages.sharedVersion,
				})
				.from(pages)
				.where(eq(pages.slug, input.slug))
				.limit(1);
			if (!page || page.visibility !== "everyone") {
				throw userError({
					code: "NOT_FOUND",
					message: "Page not found",
					i18nKey: "serverError.page.pageNotFound",
				});
			}

			await db.insert(pageReports).values({
				pageId: page.id,
				reportedVersion:
					page.sharedVersion ?? (await latestVersionNumber(page.id)),
				reason: input.reason,
				details: input.details,
				reporterEmail: input.reporterEmail,
				reportedByUserId: ctx.session?.user.id ?? null,
				reporterIpHash: ipHash,
			});

			return { received: true };
		}),

	listReports: adminProcedure
		.input(listPageReportsSchema)
		.query(async ({ input }) => {
			const cursor = input.cursor ? new Date(input.cursor) : null;
			const rows = await db
				.select({
					id: pageReports.id,
					pageId: pageReports.pageId,
					slug: pages.slug,
					title: pages.title,
					organizationId: pages.organizationId,
					visibility: pages.visibility,
					takenDownAt: pages.takenDownAt,
					reportedVersion: pageReports.reportedVersion,
					reason: pageReports.reason,
					details: pageReports.details,
					status: pageReports.status,
					reporterEmail: pageReports.reporterEmail,
					reporterIpHash: pageReports.reporterIpHash,
					reportedByUserId: pageReports.reportedByUserId,
					reviewedAt: pageReports.reviewedAt,
					reviewNote: pageReports.reviewNote,
					createdAt: pageReports.createdAt,
				})
				.from(pageReports)
				.innerJoin(pages, eq(pages.id, pageReports.pageId))
				.where(
					and(
						input.status ? eq(pageReports.status, input.status) : undefined,
						cursor ? lt(pageReports.createdAt, cursor) : undefined,
					),
				)
				.orderBy(desc(pageReports.createdAt))
				.limit(input.limit + 1);

			const reports = rows.slice(0, input.limit);
			return {
				reports,
				nextCursor:
					rows.length > input.limit
						? (reports.at(-1)?.createdAt.toISOString() ?? null)
						: null,
			};
		}),

	reviewReport: adminProcedure
		.input(reviewPageReportSchema)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(pageReports)
				.set({
					status: input.status,
					reviewNote: input.note,
					reviewedAt: new Date(),
					reviewedByUserId: ctx.session.user.id,
				})
				.where(eq(pageReports.id, input.id))
				.returning({ id: pageReports.id });
			if (!updated) {
				throw userError({
					code: "NOT_FOUND",
					message: "Report not found",
					i18nKey: "serverError.page.reportNotFound",
				});
			}
			return { id: updated.id };
		}),

	takedown: adminProcedure
		.input(takedownPageSchema)
		.mutation(async ({ ctx, input }) => {
			const [page] = await db
				.update(pages)
				.set({
					takenDownAt: new Date(),
					takenDownByUserId: ctx.session.user.id,
					takenDownNote: input.note,
				})
				.where(eq(pages.id, input.id))
				.returning({ id: pages.id });
			if (!page) {
				throw userError({
					code: "NOT_FOUND",
					message: "Page not found",
					i18nKey: "serverError.page.pageNotFound",
				});
			}

			await writePageManifest(page.id);
			await db
				.update(pageReports)
				.set({
					status: "upheld",
					reviewedAt: new Date(),
					reviewedByUserId: ctx.session.user.id,
				})
				.where(
					and(eq(pageReports.pageId, page.id), eq(pageReports.status, "open")),
				);

			return { id: page.id };
		}),

	restore: adminProcedure
		.input(takedownPageSchema)
		.mutation(async ({ input }) => {
			const [page] = await db
				.update(pages)
				.set({
					takenDownAt: null,
					takenDownByUserId: null,
					takenDownNote: input.note,
				})
				.where(eq(pages.id, input.id))
				.returning({ id: pages.id });
			if (!page) {
				throw userError({
					code: "NOT_FOUND",
					message: "Page not found",
					i18nKey: "serverError.page.pageNotFound",
				});
			}
			await writePageManifest(page.id);
			return { id: page.id };
		}),

	reportCounts: adminProcedure.query(async () => {
		const rows = await db
			.select({ status: pageReports.status, count: sql<number>`count(*)::int` })
			.from(pageReports)
			.groupBy(pageReports.status);
		return Object.fromEntries(rows.map((row) => [row.status, row.count]));
	}),
} satisfies TRPCRouterRecord;
