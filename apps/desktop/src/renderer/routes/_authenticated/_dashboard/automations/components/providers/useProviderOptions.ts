import { useMemo } from "react";
import { useGithubOptions } from "./github/useGithubOptions";
import type { ProviderOptions } from "./types";

/**
 * Every provider's pickable values, merged into one map for the editor.
 *
 * Hooks cannot be called from a registry loop, so each provider's hook is
 * called here by name. Adding a provider with options means adding its hook to
 * this list; the keys they fill are disjoint, so the merge is a spread.
 */
export function useProviderOptions(organizationId: string): ProviderOptions {
	const github = useGithubOptions(organizationId);
	return useMemo(() => ({ ...github }), [github]);
}
