import { useMemo } from "react";
import {
	useWorkspacesFilterStore,
	type WorkspaceScope,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "../useSelectedHost";

interface CloudReadiness {
	/** False while the cloud list is still loading — see the wait below. */
	isReady: boolean;
	count: number;
}

/**
 * Which scope the list is under: Cloud, or the selected machine. A hand-picked
 * scope always wins. Until someone picks one, a cold start whose remembered
 * machine is asleep opens on Cloud instead — the sandbox rows are the ones you
 * can actually work in, and the alternative is a screen of offline placeholder.
 *
 * Null until both the saved pick and the cloud list have answered: guessing
 * "host" first and correcting to "cloud" a moment later re-scopes the screen
 * under someone mid-read, which is the flicker this wait buys out.
 */
export function useWorkspaceScope(
	cloud: CloudReadiness,
): WorkspaceScope | null {
	const scope = useWorkspacesFilterStore((store) => store.scope);
	const scopePicked = useWorkspacesFilterStore((store) => store.scopePicked);
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);
	const selectedHost = useSelectedHost();

	return useMemo(() => {
		if (!hasHydrated) return null;
		if (scopePicked) return scope;
		if (!cloud.isReady) return null;
		return cloud.count > 0 && !selectedHost?.isOnline ? "cloud" : "host";
	}, [
		hasHydrated,
		scopePicked,
		scope,
		cloud.isReady,
		cloud.count,
		selectedHost?.isOnline,
	]);
}
