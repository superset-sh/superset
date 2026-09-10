import "server-only";
import { LOCALE_COOKIE, resolveRequestLocale } from "@superset/i18n/locales";
import {
	initServerI18n as bindI18n,
	preloadServerLocale,
} from "@superset/i18n/server";
import { cookies, headers } from "next/headers";
import { cache } from "react";

export const initServerI18n = cache(async () => {
	const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
	const locale = resolveRequestLocale(
		chosen,
		(await headers()).get("accept-language"),
	);
	await preloadServerLocale(locale);
	return bindI18n(locale);
});
