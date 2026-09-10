import { I18nProvider } from "@superset/i18n/react";
import type { ReactNode } from "react";
import { PostHogLocaleTagger } from "renderer/components/PostHogLocaleTagger";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function LanguageAwareI18nProvider({
	children,
}: {
	children: ReactNode;
}) {
	// Persisted setting wins; undefined falls back to first-load inference.
	const { data: language, isPending } =
		electronTrpc.settings.getLanguage.useQuery();
	const utils = electronTrpc.useUtils();
	electronTrpc.settings.onLanguageChange.useSubscription(undefined, {
		onData: (value) => utils.settings.getLanguage.setData(undefined, value),
	});
	if (isPending) return null;
	return (
		<I18nProvider locale={language ?? undefined} deferUntilReady>
			<PostHogLocaleTagger />
			{children}
		</I18nProvider>
	);
}
