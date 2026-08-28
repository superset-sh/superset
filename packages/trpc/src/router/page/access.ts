import type { SelectPage } from "@superset/db/schema";
import { userError } from "../../i18n-error";

export function assertPageReadable(page: SelectPage, userId: string): void {
	if (page.visibility === "just_me" && page.createdByUserId !== userId) {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
}

export function assertPageWritable(page: SelectPage, userId: string): void {
	assertPageReadable(page, userId);
	if (page.createdByUserId !== userId) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only the person who created this page can change it",
			i18nKey: "serverError.page.onlyThePersonWhoCreated",
		});
	}
}
