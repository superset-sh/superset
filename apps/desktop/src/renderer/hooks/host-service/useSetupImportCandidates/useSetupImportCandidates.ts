import type { AppRouter } from "@superset/host-service";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type SetupImportCandidate =
	inferRouterOutputs<AppRouter>["config"]["getSetupImportCandidates"]["candidates"][number];

export function setupImportCandidatesQuery(
	hostUrl: string | null,
	projectId: string | null,
) {
	return queryOptions({
		queryKey: ["host-config", "getSetupImportCandidates", hostUrl, projectId],
		queryFn: () => {
			if (!hostUrl || !projectId) throw new Error("no active host or project");
			return getHostServiceClientByUrl(
				hostUrl,
			).config.getSetupImportCandidates.query({ projectId });
		},
		// A host older than this client has no such procedure.
		retry: false,
	});
}

/** Candidates that would change the project's setup; others are noise. */
export function withChanges(
	candidates: SetupImportCandidate[] | undefined,
): SetupImportCandidate[] {
	return (candidates ?? []).filter((candidate) => candidate.changes.length > 0);
}

/** Setups from other tools that would change this project's Superset setup. */
export function useSetupImportCandidates({
	hostUrl,
	projectId,
	enabled = true,
}: {
	hostUrl: string | null;
	projectId: string | null;
	enabled?: boolean;
}): { candidates: SetupImportCandidate[]; configInvalid: boolean } {
	const { data } = useQuery({
		...setupImportCandidatesQuery(hostUrl, projectId),
		enabled: enabled && !!hostUrl && !!projectId,
		refetchOnWindowFocus: true,
	});
	return {
		candidates: withChanges(data?.candidates),
		// Older hosts omit the field.
		configInvalid: data?.configInvalid ?? false,
	};
}
