import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlag } from "posthog-react-native";
import { useOrgHostsQuery } from "@/hooks/useOrgHosts";
import {
	useWorkspacesFilterStore,
	type WorkspaceScope,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

/**
 * Which scope the list is under: Cloud, or the selected machine. The pick is
 * the user's alone — an asleep machine still shows as itself, offline, rather
 * than quietly moving you somewhere your work isn't.
 *
 * An organization with no machine at all is the exception. The saved default is
 * "host", and the host scope's empty state is Connect a device, which offers no
 * route back to the scope filter — so a Cloud-only account lands on setup steps
 * for a computer it will never have, with its workspaces one unreachable tap
 * away. Falling back to Cloud takes nothing from anyone: the host scope it
 * replaces is empty by definition. A machine appearing later returns the pick
 * to it, which is where that person's work then is.
 *
 * Cloud is internal-only, so a saved Cloud pick reads as "host" for everyone
 * the flag is off for; otherwise turning it off would strand them on a scope
 * they can no longer reach or leave.
 */
export function useWorkspaceScope(): WorkspaceScope {
	const scope = useWorkspacesFilterStore((store) => store.scope);
	const cloudEnabled = useCloudScopeEnabled();
	const hosts = useOrgHostsQuery();
	if (!cloudEnabled) {
		return "host";
	}
	if (scope === "cloud") {
		return "cloud";
	}
	// Only once the query has answered: an empty list while it is still pending
	// is not an answer, and guessing Cloud would flash the wrong list.
	return hosts.isSuccess && hosts.data.length === 0 ? "cloud" : "host";
}

/** Whether Cloud is offered as a scope at all. */
export function useCloudScopeEnabled(): boolean {
	return Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
}
