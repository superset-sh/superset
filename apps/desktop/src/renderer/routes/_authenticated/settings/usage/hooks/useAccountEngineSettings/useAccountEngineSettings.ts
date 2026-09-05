import type { AppRouter } from "@superset/host-service";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Per-agent settings plus the runtime state the panel renders from:
 * `engineAvailable` is false when the host runs no engine at all (a cloud
 * sandbox, KTD1), `platformSupported` false on win32 (KTD13), and `lockOwner`
 * false when another Superset instance on this machine holds the engine lock
 * (KTD5) — settings there, not here.
 */
export type AccountEngineSnapshot =
	RouterOutputs["usage"]["engine"]["getSettings"];

/** The two agents the account engine can switch (KTD13: Windows is refused). */
export type EngineAgent = keyof AccountEngineSnapshot["settings"];

/** R10 to R16, per agent. */
export type AccountEngineAgentSettings =
	AccountEngineSnapshot["settings"][EngineAgent];

export type AccountEngineAgentStatus =
	AccountEngineSnapshot["status"][EngineAgent];

export type AutoSwitchStrategy = AccountEngineAgentSettings["strategy"];

/** R14. The engine polls the active account at one of these cadences. */
export type PollIntervalSeconds =
	AccountEngineAgentSettings["pollIntervalSeconds"];

export const ACCOUNT_ENGINE_QUERY_KEY = ["host-account-engine"] as const;

/**
 * Auto-switch settings and engine status for a host. Cheap and local to the
 * host-service (no provider call), so this reads on mount and after every
 * mutation rather than polling.
 */
export function useAccountEngineSettings(hostUrl: string | null) {
	return useQuery({
		queryKey: [...ACCOUNT_ENGINE_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: (): Promise<AccountEngineSnapshot> => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(
				hostUrl,
			).usage.engine.getSettings.query();
		},
	});
}
