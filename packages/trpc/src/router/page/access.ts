import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";

/**
 * May this user see this page at all?
 *
 * Callers have already established that the page belongs to the user's
 * organization; this narrows within it. An `org` page is readable by any
 * member, a `just_me` page only by whoever created it.
 *
 * Shared by the read procedures *and* by publish, deliberately. Publishing a
 * new version to a page you cannot see would both overwrite what it serves and
 * hand back its title and description — so the same rule has to gate both, or
 * the read check is decorative.
 *
 * Note this makes readable imply writable, which is a rule rather than a
 * permission model: any member can publish a version to any `org` page. If
 * pages ever need owners or collaborators, that is a separate decision and
 * this is where it lands.
 */
export function assertPageReadable(page: SelectPage, userId: string): void {
	if (page.visibility === "just_me" && page.createdByUserId !== userId) {
		// NOT_FOUND rather than FORBIDDEN: whether a private page exists is
		// itself private.
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
}
