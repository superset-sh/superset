import { db } from "@superset/db/client";
import { files } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { del, head, put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { validateFileUpload } from "./upload-rules";

export const fileRouter = {
	/**
	 * Put bytes in the media library and return a URL for them.
	 *
	 * No parent: a file is created before the thing that references it exists.
	 * Publishing a page uploads its assets, rewrites the HTML to point at the
	 * URLs returned here, and only then creates the version the attachments
	 * hang off — so an unattached file is the normal mid-flight state, not a
	 * leak. The sweep collects any that never get attached.
	 */
	upload: protectedProcedure
		.input(
			z.object({
				content: z.string().min(1),
				contentType: z.string().min(1),
				filename: z.string().min(1).max(255),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { buffer, sha256 } = validateFileUpload(input);

			// Same bytes already in this org: reuse the row rather than storing a
			// second copy. Files are immutable, so an existing row is as good as a
			// fresh one — and it keeps a page republished ten times from uploading
			// its unchanged logo ten times.
			const [existing] = await db
				.select()
				.from(files)
				.where(
					and(
						eq(files.organizationId, organizationId),
						eq(files.sha256, sha256),
					),
				)
				.limit(1);
			if (existing) {
				return {
					id: existing.id,
					filename: existing.filename,
					contentType: existing.contentType,
					sizeBytes: existing.sizeBytes,
					sha256: existing.sha256,
					url: (await head(existing.blobPathname)).url,
					reused: true,
				};
			}

			const blob = await put(
				`files/${organizationId}/${sha256}/${input.filename}`,
				buffer,
				{
					access: "public",
					contentType: input.contentType,
					// The bytes are world-readable once the URL is known, so the random
					// suffix is what stops a private page's assets being reachable by
					// guessing a path. Access is still enforced by whatever serves the
					// parent; this is defence in depth, not the gate.
					addRandomSuffix: true,
				},
			);

			try {
				const [row] = await db
					.insert(files)
					.values({
						organizationId,
						blobPathname: blob.pathname,
						filename: input.filename,
						contentType: input.contentType,
						sizeBytes: buffer.length,
						sha256,
						createdByUserId: userId,
					})
					.returning();

				if (!row) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to record file",
					});
				}

				return {
					id: row.id,
					filename: row.filename,
					contentType: row.contentType,
					sizeBytes: row.sizeBytes,
					sha256: row.sha256,
					url: blob.url,
					reused: false,
				};
			} catch (error) {
				await del(blob.url).catch((cleanupError) => {
					console.error("[files] failed to clean up orphaned blob", {
						pathname: blob.pathname,
						cleanupError,
					});
				});
				throw error;
			}
		}),
} satisfies TRPCRouterRecord;
