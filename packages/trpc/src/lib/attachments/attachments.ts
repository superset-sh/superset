import { db, dbWs } from "@superset/db/client";
import { attachments, files } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, asc, eq, inArray } from "drizzle-orm";
import { SNIFF_BYTES, sniffContentType } from "../files";
import { getObject, headObject, presignedGetUrl } from "../r2";

type ParentKind = (typeof attachments.$inferInsert)["parentKind"];

/**
 * Keeps uploads as a parent's files. They arrive as transfer buffers the sweep
 * would reclaim in a day; each one that really landed is sniffed, marked
 * ready and attached. One that never landed is left to the sweep.
 */
export async function anchorAttachments(args: {
	parentKind: ParentKind;
	parentId: string;
	organizationId: string;
	fileIds: string[];
}) {
	if (args.fileIds.length === 0) return;
	const rows = await db
		.select()
		.from(files)
		.where(
			and(
				inArray(files.id, args.fileIds),
				eq(files.organizationId, args.organizationId),
				eq(files.status, "pending"),
			),
		);
	for (const file of rows) {
		const key = fileOriginalKey(file.id);
		const head = await headObject(key);
		if (!head || head.sizeBytes !== file.sizeBytes) continue;
		const sample = await getObject(key, {
			range: `bytes=0-${SNIFF_BYTES - 1}`,
		});
		const bytes = sample
			? new Uint8Array(await sample.arrayBuffer())
			: new Uint8Array();
		await dbWs.transaction(async (tx) => {
			const [ready] = await tx
				.update(files)
				.set({
					contentType: sniffContentType(bytes, file.contentType),
					status: "ready",
				})
				.where(and(eq(files.id, file.id), eq(files.status, "pending")))
				.returning({ id: files.id });
			if (!ready) return;
			await tx.insert(attachments).values({
				fileId: file.id,
				parentKind: args.parentKind,
				parentId: args.parentId,
			});
		});
	}
}

export async function loadAttachments(
	parentKind: ParentKind,
	parentIds: string[],
) {
	if (parentIds.length === 0) return new Map<string, LoadedAttachment[]>();
	const rows = await db
		.select({
			parentId: attachments.parentId,
			id: files.id,
			name: files.name,
			contentType: files.contentType,
			createdAt: attachments.createdAt,
		})
		.from(attachments)
		.innerJoin(files, eq(files.id, attachments.fileId))
		.where(
			and(
				eq(attachments.parentKind, parentKind),
				inArray(attachments.parentId, parentIds),
			),
		)
		.orderBy(asc(attachments.createdAt));
	const byParent = new Map<string, LoadedAttachment[]>();
	for (const { parentId, ...row } of rows) {
		const list = byParent.get(parentId) ?? [];
		list.push({ ...row, url: await presignedGetUrl(fileOriginalKey(row.id)) });
		byParent.set(parentId, list);
	}
	return byParent;
}

export interface LoadedAttachment {
	id: string;
	name: string;
	contentType: string;
	createdAt: Date;
	url: string;
}
