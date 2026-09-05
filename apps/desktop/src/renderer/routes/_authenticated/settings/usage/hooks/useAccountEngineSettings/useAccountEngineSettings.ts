import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/** The two agents the account engine can switch (KTD13: Windows is refused). */
export type EngineAgent = "claude" | "codex";

export type AutoSwitchStrategy = "best" | "consume-first";

/** R14. The engine polls the active account at one of these cadences. */
export type PollIntervalSeconds = 30 | 60 | 120 | 300;

/** R10 to R16, per agent. */
export interface AccountEngineAgentSettings {
	enabled: boolean;
	thresholdPercent: number;
	strategy: AutoSwitchStrategy;
	modelWindows: string[];
	pollIntervalSeconds: PollIntervalSeconds;
	cooldownSeconds: number;
}

export interface AccountEngineAgentStatus {
	enabled: boolean;
	activeAccountId: string | null;
	activeSelection: string | null;
	cooldownUntil: number | null;
	exhausted: boolean;
	lockOwner: boolean;
	platformSupported: boolean;
}

export interface AccountEngineSnapshot {
	/** False when the host runs no engine at all (a cloud sandbox, KTD1). */
	engineAvailable: boolean;
	/** False on win32 (KTD13). */
	platformSupported: boolean;
	/** False when another Superset instance on this machine holds the
	 * engine lock (KTD5) — settings there, not here. */
	lockOwner: boolean;
	settings: Record<EngineAgent, AccountEngineAgentSettings>;
	status: Record<EngineAgent, AccountEngineAgentStatus>;
}

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
