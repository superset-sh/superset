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
	// No parent: a file exists before the version that references it, so an
	// unattached file is the normal mid-flight state.
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

			// Same bytes in this org: reuse the row rather than store a second copy.
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
				// A row can outlive its blob. The bytes are in hand, so re-upload and
				// re-point rather than fail; sha256 is unchanged either way.
				const reusedUrl = await head(existing.blobPathname)
					.then((meta) => meta.url)
					.catch(() => null);
				if (reusedUrl) {
					return {
						id: existing.id,
						filename: existing.filename,
						contentType: existing.contentType,
						sizeBytes: existing.sizeBytes,
						sha256: existing.sha256,
						url: reusedUrl,
						reused: true,
					};
				}

				console.warn("[files] blob missing for existing row, re-uploading", {
					fileId: existing.id,
					pathname: existing.blobPathname,
				});
				const replacement = await put(
					`files/${organizationId}/${sha256}/${input.filename}`,
					buffer,
					{
						access: "public",
						contentType: input.contentType,
						addRandomSuffix: true,
					},
				);
				await db
					.update(files)
					.set({ blobPathname: replacement.pathname })
					.where(eq(files.id, existing.id));
				return {
					id: existing.id,
					filename: existing.filename,
					contentType: existing.contentType,
					sizeBytes: existing.sizeBytes,
					sha256: existing.sha256,
					url: replacement.url,
					reused: true,
				};
			}

			const blob = await put(
				`files/${organizationId}/${sha256}/${input.filename}`,
				buffer,
				{
					access: "public",
					contentType: input.contentType,
					// Defence in depth, not the gate.
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
