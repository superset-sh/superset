import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** How often to re-ask while someone is looking at the editor. */
const POLL_MS = 10_000;

/**
 * Which integrations are connected, so a row can say it will never fire.
 *
 * Polled rather than fetched once, because connecting happens *outside this
 * window*: the Connect button opens the web app, the person authorizes there,
 * and comes back. Without a refetch the row would still claim the integration
 * is missing until the page was reopened.
 *
 * Cheap by construction — one procedure answers every provider, and both
 * refetch paths are idle when the app is not in front of someone.
 * `refetchIntervalInBackground` stays false, so a window left open overnight
 * asks for nothing.
 */
export function useProviderConnections(organizationId: string): {
	connected: Record<string, boolean>;
	/** Connected once, but the refresh failed: the fix is Reconnect, not Connect. */
	needsReauth: Record<string, boolean>;
	isPending: boolean;
} {
	const query = cloudTrpc.integration.connectionStatus.useQuery(
		{ organizationId },
		{
			enabled: Boolean(organizationId),
			refetchInterval: POLL_MS,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			// The answer is only interesting when it changes, and it changes
			// elsewhere — so never serve a cached one to a returning window.
			staleTime: 0,
		},
	);

	return useMemo(() => {
		const connected: Record<string, boolean> = {};
		const needsReauth: Record<string, boolean> = {};
		for (const [provider, state] of Object.entries(query.data ?? {})) {
			connected[provider] = state.connected;
			needsReauth[provider] = state.needsReauth;
		}
		return { connected, needsReauth, isPending: query.isPending };
	}, [query.data, query.isPending]);
}
