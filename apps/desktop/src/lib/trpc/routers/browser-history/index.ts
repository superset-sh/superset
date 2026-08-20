import { browserHistory } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { like, or, sql } from "drizzle-orm";
import { session } from "electron";
import { importCookiesIntoSession } from "main/lib/browser/chrome-cookie-import";
import {
	listChromeImportSources,
	readHistoryFromProfile,
	resolveImportProfile,
	resolveImportSource,
} from "main/lib/browser/chrome-history-import";
import { hasUnreadableChromiumBrowser } from "main/lib/browser/chromium-profiles";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/** Rows per multi-row upsert, kept well under SQLite's bound-parameter limit. */
const IMPORT_CHUNK_SIZE = 200;

/** The partition the in-app browser pane (and app renderer) use. */
const BROWSER_PARTITION = "persist:superset";

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
				try {
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
				} catch (error) {
					if ((error as { code?: string }).code !== "SQLITE_FULL") {
						throw error;
					}
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}),

		clear: publicProcedure.mutation(() => {
			localDb.delete(browserHistory).run();
		}),

		/**
		 * Lists Chromium profiles (Chrome, Brave, Arc, …) whose history can be
		 * imported. Chrome's data dir is normally readable without Full Disk
		 * Access; we only hint at FDA when a browser is installed but its profile
		 * directory can't be read.
		 */
		getImportSources: publicProcedure.query(() => {
			const sources = listChromeImportSources();
			if (sources.length > 0) {
				return { needsFullDiskAccess: false, sources };
			}
			return {
				needsFullDiskAccess:
					process.platform === "darwin" && hasUnreadableChromiumBrowser(),
				sources,
			};
		}),

		/**
		 * Imports browsing history from one Chromium profile into our own history
		 * store, merging with anything already there. Returns how many rows were
		 * read from the source.
		 */
		importFromSource: publicProcedure
			.input(z.object({ sourceId: z.string() }))
			.mutation(async ({ input }) => {
				const profileDir = resolveImportSource(input.sourceId);
				if (!profileDir) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "That browser profile is no longer available.",
					});
				}

				let entries: Awaited<ReturnType<typeof readHistoryFromProfile>>;
				try {
					entries = await readHistoryFromProfile(profileDir);
				} catch (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							error instanceof Error
								? `Could not read browser history: ${error.message}`
								: "Could not read browser history.",
					});
				}

				if (entries.length === 0) return { imported: 0 };

				try {
					localDb.transaction((tx) => {
						for (let i = 0; i < entries.length; i += IMPORT_CHUNK_SIZE) {
							const chunk = entries.slice(i, i + IMPORT_CHUNK_SIZE);
							tx.insert(browserHistory)
								.values(
									chunk.map((entry) => ({
										url: entry.url,
										title: entry.title,
										faviconUrl: null,
										lastVisitedAt: entry.lastVisitedAt,
										visitCount: entry.visitCount,
									})),
								)
								.onConflictDoUpdate({
									target: browserHistory.url,
									set: {
										// Keep an existing title if the import has none.
										title: sql`coalesce(nullif(excluded.title, ''), ${browserHistory.title})`,
										lastVisitedAt: sql`max(${browserHistory.lastVisitedAt}, excluded.last_visited_at)`,
										// max, not sum, so re-importing doesn't inflate counts.
										visitCount: sql`max(${browserHistory.visitCount}, excluded.visit_count)`,
									},
								})
								.run();
						}
					});
				} catch (error) {
					if ((error as { code?: string }).code === "SQLITE_FULL") {
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message:
								"Not enough space to import history. Clear some history and try again.",
						});
					}
					throw error;
				}

				return { imported: entries.length };
			}),

		/**
		 * Imports logins (cookies) from one Chromium profile into the in-app
		 * browser's session, so sites the user is signed into carry over. macOS
		 * only (needs the browser's Keychain key); returns 0 elsewhere or when the
		 * key is denied. Superset's own hosts are never imported.
		 */
		importCookiesFromSource: publicProcedure
			.input(z.object({ sourceId: z.string() }))
			.mutation(async ({ input }) => {
				const profile = resolveImportProfile(input.sourceId);
				if (!profile) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "That browser profile is no longer available.",
					});
				}

				try {
					return await importCookiesIntoSession(
						session.fromPartition(BROWSER_PARTITION),
						profile.profileDir,
						profile.browserKey,
					);
				} catch (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							error instanceof Error
								? `Could not import browser cookies: ${error.message}`
								: "Could not import browser cookies.",
					});
				}
			}),
	});
};
