import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/** Returns whether v2 is currently active for this user. */
export function useIsV2CloudEnabled(): boolean {
	return useV2LocalOverrideStore((s) => s.optInV2);
}
