import { I18nProvider } from "@superset/i18n/react";
import type { ReactNode } from "react";
import { PostHogLocaleTagger } from "renderer/components/PostHogLocaleTagger";
import { electronTrpc } from "renderer/lib/electron-trpc";

// The electron-trpc IPC channel can still be settling right after a CMD+R
// reload (the preload script re-establishes it in a fresh JS realm), which
// makes the first getLanguage fetch after a reload the one most likely to
// race it. Retry a few times with a short backoff so that race self-heals
// instead of settling into a permanent error on the first attempt.
const GET_LANGUAGE_MAX_RETRIES = 3;
const GET_LANGUAGE_RETRY_DELAY_MS = 250;

export function LanguageAwareI18nProvider({
	children,
}: {
	children: ReactNode;
}) {
	// Persisted setting wins; undefined falls back to first-load inference.
	// React Query keeps `isPending` true across every configured retry, so a
	// transient reload-time race (#7415) self-heals here without ever
	// reaching the fallback below. Only a genuinely exhausted retry budget
	// settles into isPending: false with no data.
	const { data: language, isPending } =
		electronTrpc.settings.getLanguage.useQuery(undefined, {
			retry: GET_LANGUAGE_MAX_RETRIES,
			retryDelay: (attempt) => GET_LANGUAGE_RETRY_DELAY_MS * (attempt + 1),
		});
	const utils = electronTrpc.useUtils();
	electronTrpc.settings.onLanguageChange.useSubscription(undefined, {
		onData: (value) => utils.settings.getLanguage.setData(undefined, value),
	});
	if (isPending) return null;
	// A persisted preference that's still unreadable after every retry falls
	// back to the inferred locale (via `language ?? undefined` below) rather
	// than leaving the window blank forever — a stuck IPC channel is rare
	// and would break the rest of the app too, so showing something in the
	// wrong language beats showing nothing.
	return (
		<I18nProvider locale={language ?? undefined} deferUntilReady>
			<PostHogLocaleTagger />
			{children}
		</I18nProvider>
	);
}
