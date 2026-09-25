import { useLingui } from "@lingui/react";
import { inferLocale } from "@superset/i18n";
import { useEffect } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import { resolveLocaleTag } from "./localeTag";

/**
 * Tags every event with the language actually on screen and whether it came
 * from a pinned setting or the system language, so locale adoption and
 * opt-outs are visible in PostHog without a dedicated event per surface.
 * Must render inside I18nProvider: it reads the active Lingui locale.
 */
export function PostHogLocaleTagger() {
	const { i18n } = useLingui();
	const activeLocale = i18n.locale;
	const { data: language } = electronTrpc.settings.getLanguage.useQuery();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	useEffect(() => {
		const tag = resolveLocaleTag({
			activeLocale,
			language,
			inferredLocale: inferLocale(),
		});
		if (!tag) return;

		posthog.register(tag);

		if (!userId) return;
		posthog.people.set(tag);
	}, [activeLocale, language, userId]);

	return null;
}
