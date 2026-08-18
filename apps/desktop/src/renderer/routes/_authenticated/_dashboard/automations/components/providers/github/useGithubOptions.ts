import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/** The pickable values a GitHub sentence needs: repositories and linked people. */
export function useGithubOptions(organizationId: string): ProviderOptions {
	// repoId is GitHub's numeric id, which is what the matcher compares against —
	// a full name would stop matching the moment someone renames the repo.
	const repos = cloudTrpc.integration.github.listRepositories.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);
	const people = cloudTrpc.integration.github.listLinkedPeople.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);

	return useMemo(
		() => ({
			github: {
				repositories: (repos.data ?? []).map((repo) => ({
					id: repo.repoId,
					label: repo.fullName,
				})),
				people: people.data ?? [],
			},
		}),
		[repos.data, people.data],
	);
}
