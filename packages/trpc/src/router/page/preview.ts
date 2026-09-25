import { db } from "@superset/db/client";
import {
	pages,
	pageVersions,
	type SelectPage,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	pageThumbnailKey,
	pageThumbnailUrl,
} from "@superset/shared/usercontent";
import { and, desc, eq } from "drizzle-orm";
import { env } from "../../env";
import { objectExists } from "../../lib/r2";
import { pageUrl } from "./page-url";
import { servedVersion } from "./shared-version";
import { mintPageTicket } from "./storage";

export interface PagePreview {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	url: string;
	updatedAt: Date;
	thumbnailUrl: string | null;
	createdBy: { name: string; email: string } | null;
}

export type PagePreviewResult =
	| { status: "readable"; preview: PagePreview }
	| { status: "needs_user" }
	| { status: "missing" };

export interface PreviewReader {
	userId: string;
	isMember: () => Promise<boolean>;
}

export async function previewAccess(
	page: Pick<SelectPage, "visibility" | "createdByUserId" | "takenDownAt">,
	reader: PreviewReader | undefined,
): Promise<PagePreviewResult["status"]> {
	if (page.takenDownAt) return "missing";
	if (page.visibility === "everyone") return "readable";
	if (!reader) return "needs_user";
	if (!(await reader.isMember())) return "missing";
	if (page.visibility === "just_me" && page.createdByUserId !== reader.userId) {
		return "missing";
	}
	return "readable";
}

/**
 * What a link to a page may show outside the app, for a reader who is not
 * signed in to it (a Slack unfurl). `userId` is the reader when the caller
 * has resolved one; without it only public pages preview.
 */
export async function pagePreview({
	slug,
	organizationId,
	userId,
}: {
	slug: string;
	organizationId: string;
	userId?: string;
}): Promise<PagePreviewResult> {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.slug, slug), eq(pages.organizationId, organizationId)))
		.limit(1);
	if (!page) return { status: "missing" };

	const reader: PreviewReader | undefined =
		userId === undefined
			? undefined
			: {
					userId,
					isMember: async () =>
						(await findOrgMembership({ userId, organizationId })) !== undefined,
				};
	const access = await previewAccess(page, reader);
	if (access !== "readable") return { status: access };

	const version = servedVersion(
		page.sharedVersion,
		await latestVersionNumber(page.id),
	);
	if (version === null) return { status: "missing" };

	const captured = await objectExists(pageThumbnailKey(page.id, version)).catch(
		() => false,
	);

	return {
		status: "readable",
		preview: {
			id: page.id,
			slug: page.slug,
			title: page.title,
			description: page.description,
			url: pageUrl(page.slug),
			updatedAt: page.updatedAt,
			thumbnailUrl: captured
				? pageThumbnailUrl({
						baseUrl: env.USERCONTENT_URL,
						pageId: page.id,
						version,
						ticket: await mintPageTicket(page, { version }),
					})
				: null,
			createdBy: await loadCreator(page.createdByUserId),
		},
	};
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

async function loadCreator(
	userId: string | null,
): Promise<PagePreview["createdBy"]> {
	if (!userId) return null;
	const [creator] = await db
		.select({ name: users.name, email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return creator ?? null;
}
