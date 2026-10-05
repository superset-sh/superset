import { db } from "@superset/db/client";
import {
	attachments,
	members,
	taskComments,
	taskProjects,
	tasks,
} from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { env } from "../../env";
import { presignedGetUrl } from "../r2";

/**
 * A document stores each of its files as a URL mounted under the record it
 * belongs to, the way Linear stores `uploads.linear.app` URLs. Readers get the
 * document with those swapped for short-lived signed links, and a save swaps
 * them back, so what is stored never expires and access follows the record.
 */
export interface DocumentScope {
	kind: "tasks" | "projects";
	id: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SIGNED_LINK = new RegExp(
	`https?://[^\\s)"'<>]*?/files/(${UUID})/original\\?[^\\s)"'<>]*`,
	"gi",
);

const SIGNING_WINDOW_MS = 60 * 60 * 1000;

/**
 * Links signed within the same hour come out identical, so a document polled
 * for changes reads the same until someone edits it. Each link outlives its
 * window by an hour.
 */
export function readLinkSigning(now: Date) {
	return {
		signingDate: new Date(
			Math.floor(now.getTime() / SIGNING_WINDOW_MS) * SIGNING_WINDOW_MS,
		),
		expiresInSeconds: (2 * SIGNING_WINDOW_MS) / 1000,
	};
}

function presignedReadUrl(fileId: string) {
	const { signingDate, expiresInSeconds } = readLinkSigning(new Date());
	return presignedGetUrl(
		fileOriginalKey(fileId),
		expiresInSeconds,
		signingDate,
	);
}

const escapeForRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function documentFileRef(scope: DocumentScope, fileId: string) {
	return `${env.NEXT_PUBLIC_API_URL}/api/${scope.kind}/${scope.id}/files/${fileId}`;
}

const storedRef = (scope: DocumentScope) =>
	new RegExp(`${escapeForRegExp(documentFileRef(scope, ""))}(${UUID})`, "gi");

/** What a save stores: signed links an editor round-tripped become references again. */
export function toStoredDocument(markdown: string, scope: DocumentScope) {
	return markdown.replace(SIGNED_LINK, (_, fileId: string) =>
		documentFileRef(scope, fileId.toLowerCase()),
	);
}

export function referencedFileIds(markdown: string, scope: DocumentScope) {
	return [
		...new Set(
			[...markdown.matchAll(storedRef(scope))].map((match) =>
				(match[1] as string).toLowerCase(),
			),
		),
	];
}

/** The files among these that are attached to the record, the only ones a reader of it may open. */
export async function attachedFileIds(
	scope: DocumentScope,
	fileIds: string[],
): Promise<Set<string>> {
	if (fileIds.length === 0) return new Set();
	const parent =
		scope.kind === "tasks"
			? or(
					and(
						eq(attachments.parentKind, "issue"),
						eq(attachments.parentId, scope.id),
					),
					and(
						eq(attachments.parentKind, "task_comment"),
						inArray(
							attachments.parentId,
							db
								.select({ id: taskComments.id })
								.from(taskComments)
								.where(eq(taskComments.taskId, scope.id)),
						),
					),
				)
			: and(
					eq(attachments.parentKind, "project_description"),
					eq(attachments.parentId, scope.id),
				);
	const rows = await db
		.select({ fileId: attachments.fileId })
		.from(attachments)
		.where(and(inArray(attachments.fileId, fileIds), parent));
	return new Set(rows.map((row) => row.fileId));
}

/** What a reader gets: references to the record's own files become signed links. */
export async function toReadableDocument(
	markdown: string,
	scope: DocumentScope,
): Promise<string> {
	const fileIds = referencedFileIds(markdown, scope);
	const allowed = await attachedFileIds(scope, fileIds);
	if (allowed.size === 0) return markdown;
	const signed = new Map(
		await Promise.all(
			[...allowed].map(
				async (fileId) => [fileId, await presignedReadUrl(fileId)] as const,
			),
		),
	);
	return markdown.replace(
		storedRef(scope),
		(ref, fileId: string) => signed.get(fileId.toLowerCase()) ?? ref,
	);
}

/**
 * A signed link for one file, for someone who can open the record it is
 * attached to; null otherwise. Serves the stored references to readers
 * outside the app, such as an agent holding a token.
 */
export async function signedDocumentFileUrl(args: {
	userId: string;
	scope: DocumentScope;
	fileId: string;
}): Promise<string | null> {
	const uuid = new RegExp(`^${UUID}$`, "i");
	if (!uuid.test(args.scope.id) || !uuid.test(args.fileId)) return null;
	const fileId = args.fileId.toLowerCase();
	const [record] =
		args.scope.kind === "tasks"
			? await db
					.select({ organizationId: tasks.organizationId })
					.from(tasks)
					.where(and(eq(tasks.id, args.scope.id), isNull(tasks.deletedAt)))
			: await db
					.select({ organizationId: taskProjects.organizationId })
					.from(taskProjects)
					.where(eq(taskProjects.id, args.scope.id));
	if (!record) return null;
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, record.organizationId),
			eq(members.userId, args.userId),
		),
		columns: { id: true },
	});
	if (!membership) return null;
	const allowed = await attachedFileIds(args.scope, [fileId]);
	if (!allowed.has(fileId)) return null;
	return presignedReadUrl(fileId);
}
