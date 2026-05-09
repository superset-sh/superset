import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { V2_AGENT_CONFIGS_QUERY_KEY } from "renderer/hooks/useV2AgentConfigs";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * Once per `hostUrl` (per renderer session), pulls the legacy v1 agent-preset
 * mirror plan from desktop main and applies it to the host-service's
 * `host_agent_configs`. Fixes #4195 — pre-#3546 users whose `--dangerously-skip-permissions`
 * was applied to the v1 envelope but never reached the host-service store.
 *
 * Idempotent on the host-service side: each entry only writes when the row
 * still matches the seed default exactly. Calling repeatedly is safe.
 */
export function useV2HostAgentMirror(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const planQuery = electronTrpc.settings.getV2HostAgentMirrorPlan.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const ranForHostUrlRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!hostUrl) return;
		if (!planQuery.data) return;
		if (ranForHostUrlRef.current.has(hostUrl)) return;
		const plan = planQuery.data;
		ranForHostUrlRef.current.add(hostUrl);
		if (plan.length === 0) return;

		void (async () => {
			try {
				const result = await getHostServiceClientByUrl(
					hostUrl,
				).settings.agentConfigs.mirrorLegacyOverrides.mutate({
					overrides: plan,
				});
				if (result.applied.length > 0) {
					await queryClient.invalidateQueries({
						queryKey: [...V2_AGENT_CONFIGS_QUERY_KEY, hostUrl],
					});
				}
			} catch (err) {
				// Don't retry on this attempt — the per-hostUrl ref already advanced.
				// User can restart the app to retry; or any v2-side edit invalidates
				// the seed-default-match check anyway.
				console.warn("[useV2HostAgentMirror] mirror failed", err);
			}
		})();
	}, [hostUrl, planQuery.data, queryClient]);
}
