import type { SelectPage } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";

export function assertPageReadable(page: SelectPage, userId: string): void {
	if (page.visibility === "just_me" && page.createdByUserId !== userId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
	}
}

export function assertPageWritable(page: SelectPage, userId: string): void {
	assertPageReadable(page, userId);
	if (page.createdByUserId !== userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the person who created this page can publish new versions",
		});
	}
}
