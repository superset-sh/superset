import { useMemo } from "react";
import { useGithubOptions } from "./github/useGithubOptions";
import type { ProviderOptions } from "./types";

/**
 * Every provider's pickable values, merged into one map for the editor.
 *
 * Hooks cannot be called from a registry loop, so each provider's hook is
 * called here by name. Adding a provider with options means adding its hook to
 * this list. Each hook returns its own top-level key (`{ github: {...} }`), so
 * the merge is a spread and cannot clobber.
 */
export function useProviderOptions(organizationId: string): ProviderOptions {
	const github = useGithubOptions(organizationId);
	return useMemo(() => ({ ...github }), [github]);
}
