import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";

// Gates reads *and* publish: readable implies writable, so any member can add a
// version to any `org` page. Owners/collaborators would land here.
export function assertPageReadable(page: SelectPage, userId: string): void {
	if (page.visibility === "just_me" && page.createdByUserId !== userId) {
		// NOT_FOUND, not FORBIDDEN: a private page's existence is itself private.
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
}
