import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { useCloudEnvironments } from "@/hooks/useCloudEnvironments";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

/**
 * The environment the next cloud workspace is created in, and the repository
 * it opens on: the environment's first repository. Only environments that
 * carry repositories can start a workspace.
 */
export function useCloudCreateSelection() {
	const environmentId = useNewSessionPreferencesStore(
		(state) => state.environmentId,
	);

	const environmentsQuery = useCloudEnvironments();
	const environments = startableCloudEnvironments(environmentsQuery.data ?? []);
	const environment =
		environments.find((row) => row.id === environmentId) ??
		environments[0] ??
		null;

	return {
		environmentsQuery,
		environments,
		environment,
		repository: environment?.repositories[0] ?? null,
	};
}
