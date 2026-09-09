import type { AppRouter } from "@superset/host-service";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type UsageLogins = inferRouterOutputs<AppRouter>["usage"]["logins"];

const LOGIN_POLL_INTERVAL_MS = 3_000;

/**
 * Local-only login discovery on the host (no provider network calls), polled
 * while an add-account sign-in is pending so the dialog can react the moment
 * the new profile lands on disk. The poll keeps running while the window is
 * unfocused: the user is off in a terminal (or a browser tab) finishing the
 * sign-in for exactly as long as this query is enabled.
 */
export function useHostUsageLogins(hostUrl: string | null, enabled: boolean) {
	return useQuery({
		queryKey: ["host-usage-logins", hostUrl],
		enabled: !!hostUrl && enabled,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).usage.logins.query();
		},
		refetchInterval: enabled ? LOGIN_POLL_INTERVAL_MS : false,
		refetchIntervalInBackground: true,
		gcTime: 0,
	});
}
