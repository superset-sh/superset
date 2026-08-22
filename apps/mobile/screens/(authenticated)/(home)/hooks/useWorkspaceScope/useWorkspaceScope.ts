import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlag } from "posthog-react-native";
import {
	useWorkspacesFilterStore,
	type WorkspaceScope,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

/**
 * Which scope the list is under: Cloud, or the selected machine. The pick is
 * the user's alone — an asleep machine still shows as itself, offline, rather
 * than quietly moving you somewhere your work isn't.
 *
 * Cloud is internal-only, so a saved Cloud pick reads as "host" for everyone
 * the flag is off for; otherwise turning it off would strand them on a scope
 * they can no longer reach or leave.
 */
export function useWorkspaceScope(): WorkspaceScope {
	const scope = useWorkspacesFilterStore((store) => store.scope);
	const cloudEnabled = useCloudScopeEnabled();
	return scope === "cloud" && cloudEnabled ? "cloud" : "host";
}

/** Whether Cloud is offered as a scope at all. */
export function useCloudScopeEnabled(): boolean {
	return Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
}
