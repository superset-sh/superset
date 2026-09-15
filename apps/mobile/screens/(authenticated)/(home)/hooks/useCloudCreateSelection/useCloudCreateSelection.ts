import { useQuery } from "@tanstack/react-query";
import { useCloudEnvironments } from "@/hooks/useCloudEnvironments";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

/**
 * The environment the next cloud workspace is created in, and the repository
 * it opens on. An environment with repositories fixes them, its first being
 * the primary; one without (the shared image) takes the person's pick from
 * the organization's GitHub repositories.
 */
export function useCloudCreateSelection() {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const environmentId = useNewSessionPreferencesStore(
		(state) => state.environmentId,
	);
	const repositoryId = useNewSessionPreferencesStore(
		(state) => state.repositoryId,
	);

	const environmentsQuery = useCloudEnvironments();
	const environments = environmentsQuery.data ?? [];
	const environment =
		environments.find((row) => row.id === environmentId) ??
		environments[0] ??
		null;
	const picksRepository =
		environment !== null && environment.repositories.length === 0;

	const repositoriesQuery = useQuery({
		queryKey: ["cloud", "github", "repositories", organizationId],
		enabled: picksRepository && organizationId !== null,
		queryFn: () =>
			apiClient.integration.github.listRepositories.query({
				organizationId: organizationId as string,
			}),
	});
	const repository = picksRepository
		? (repositoriesQuery.data?.find((row) => row.id === repositoryId) ?? null)
		: (environment?.repositories[0] ?? null);

	return {
		environmentsQuery,
		environments,
		environment,
		picksRepository,
		repositoriesQuery,
		repository,
	};
}
