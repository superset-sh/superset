import { db } from "@superset/db/client";
import {
	type PageShareRole,
	pageShares,
	pages,
	type SelectPage,
} from "@superset/db/schema";
import { and, eq, exists, or, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { grantsTo, pageShareRoleFor } from "../../lib/sharing";

type AccessPage = Pick<
	SelectPage,
	"id" | "visibility" | "orgRole" | "createdByUserId" | "takenDownAt"
>;

export interface PageAccess {
	canRead: boolean;
	canComment: boolean;
	canManage: boolean;
}

/**
 * What `userId`, already known to be in the page's organization, may do.
 * `shareRole` is the strongest role the page's shares give them, or null.
 */
export function pageAccess(
	page: AccessPage,
	userId: string,
	shareRole: PageShareRole | null,
): PageAccess {
	const owner = page.createdByUserId === userId;
	const general = page.visibility !== "just_me";
	return {
		canRead: owner || general || shareRole !== null,
		canComment:
			owner ||
			shareRole === "comment" ||
			(general && page.orgRole === "comment"),
		canManage: owner && !page.takenDownAt,
	};
}

/** Pages shared with `userId`, directly or through one of their teams. */
export function pageSharedWith(userId: string) {
	return exists(
		db
			.select({ one: sql`1` })
			.from(pageShares)
			.where(
				and(eq(pageShares.pageId, pages.id), grantsTo(pageShares, userId)),
			),
	);
}

/** The SQL twin of `pageAccess(...).canRead`, for a reader already in the page's organization. */
export function pageReadableBy(userId: string) {
	return or(
		eq(pages.visibility, "org"),
		eq(pages.visibility, "everyone"),
		and(
			eq(pages.visibility, "just_me"),
			or(eq(pages.createdByUserId, userId), pageSharedWith(userId)),
		),
	);
}

/** Skips the lookup for the owner, who never needs a share. */
export async function loadPageShareRole(
	page: Pick<SelectPage, "id" | "createdByUserId">,
	userId: string,
): Promise<PageShareRole | null> {
	if (page.createdByUserId === userId) return null;
	return pageShareRoleFor(page.id, userId);
}

export function assertPageReadable(
	page: AccessPage,
	userId: string,
	shareRole: PageShareRole | null = null,
): void {
	if (!pageAccess(page, userId, shareRole).canRead) {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
}

export function assertPageCommentable(
	page: AccessPage,
	userId: string,
	shareRole: PageShareRole | null,
): void {
	assertPageReadable(page, userId, shareRole);
	if (!pageAccess(page, userId, shareRole).canComment) {
		throw userError({
			code: "FORBIDDEN",
			message: "You can view this page but not comment on it",
			i18nKey: "serverError.page.cannotComment",
		});
	}
}

export function assertPageWritable(
	page: AccessPage,
	userId: string,
	shareRole: PageShareRole | null = null,
): void {
	assertPageReadable(page, userId, shareRole);
	if (page.takenDownAt) {
		throw userError({
			code: "FORBIDDEN",
			message: "This page was taken down and can no longer be changed",
			i18nKey: "serverError.page.thisPageWasTakenDown",
		});
	}
	if (page.createdByUserId !== userId) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only the person who created this page can change it",
			i18nKey: "serverError.page.onlyThePersonWhoCreated",
		});
	}
}
