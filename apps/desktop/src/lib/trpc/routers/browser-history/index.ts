import { browserHistory } from "@superset/local-db";
import { like, or, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createBrowserHistoryRouter = () => {
	return router({
		getAll: publicProcedure.query(() => {
			return localDb
				.select()
				.from(browserHistory)
				.orderBy(sql`${browserHistory.lastVisitedAt} desc`)
				.limit(500)
				.all();
		}),

		search: publicProcedure
			.input(z.object({ query: z.string() }))
			.query(({ input }) => {
				const pattern = `%${input.query}%`;
				return localDb
					.select()
					.from(browserHistory)
					.where(
						or(
							like(browserHistory.url, pattern),
							like(browserHistory.title, pattern),
						),
					)
					.orderBy(sql`${browserHistory.lastVisitedAt} desc`)
					.limit(10)
					.all();
			}),

		upsert: publicProcedure
			.input(
				z.object({
					url: z.string(),
					title: z.string(),
					faviconUrl: z.string().nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(browserHistory)
					.values({
						url: input.url,
						title: input.title,
						faviconUrl: input.faviconUrl ?? null,
						lastVisitedAt: Date.now(),
						visitCount: 1,
					})
					.onConflictDoUpdate({
						target: browserHistory.url,
						set: {
							title: input.title,
							faviconUrl: input.faviconUrl ?? null,
							lastVisitedAt: Date.now(),
							visitCount: sql`${browserHistory.visitCount} + 1`,
						},
					})
					.run();
			}),

		clear: publicProcedure.mutation(() => {
			localDb.delete(browserHistory).run();
		}),
	});
};
