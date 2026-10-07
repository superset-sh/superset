import { errorMessage } from "@superset/i18n/errors";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import {
	groupProjectTargetsByHost,
	type ProjectQueryTarget,
} from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";

import { queryIssueSearchCapabilities } from "renderer/routes/_authenticated/_dashboard/utils/queryRepoSearchCapabilities";

type Capability = Awaited<
	ReturnType<
		HostServiceClient["workspaceCreation"]["getIssueSearchCapabilities"]["query"]
	>
>[number];
export interface IssueSearchSelection {
	mode: "github" | "gitlab" | "mixed" | "unknown";
	pending: boolean;
	error?: string;
	refetch?: () => void;
}
export function deriveIssueSearchSelection(
	capabilities: readonly Capability[],
	expected: number,
	pending: boolean,
	error?: string,
): IssueSearchSelection {
	const failure = error ?? capabilities.find((c) => c.error)?.error?.message;
	const known =
		!pending &&
		!failure &&
		expected > 0 &&
		capabilities.length === expected &&
		new Set(capabilities.map((c) => c.projectId)).size === expected &&
		capabilities.every((c) => c.provider !== null);
	const native = capabilities.some((c) => c.provider === "gitlab"),
		github = capabilities.some((c) => c.provider === "github");
	return {
		mode: !known
			? "unknown"
			: native
				? github
					? "mixed"
					: "gitlab"
				: "github",
		pending,
		error: failure,
	};
}
export function useIssueSearchSelection(
	targets: ProjectQueryTarget[],
	enabled: boolean,
): IssueSearchSelection {
	const hosts = useMemo(() => groupProjectTargetsByHost(targets), [targets]);
	const queries = useQueries({
		queries: hosts.map((host) => ({
			queryKey: ["issues", "searchCapabilities", host.key, host.hostUrl],
			enabled: enabled && !!host.hostUrl,
			queryFn: async () => {
				if (!host.hostUrl) return [];
				return queryIssueSearchCapabilities(
					getHostServiceClientByUrl(host.hostUrl),
					host.projects.map((p) => p.projectId),
				);
			},
			staleTime: 0,
			refetchInterval: 30000,
			retry: false,
		})),
	});
	const failure = queries.find((q) => q.isError)?.error;
	const selection = deriveIssueSearchSelection(
		queries.flatMap((q) => (q.isError ? [] : (q.data ?? []))),
		targets.length,
		enabled &&
			queries.some(
				(q, index) =>
					!!hosts[index]?.hostUrl && q.data === undefined && q.isPending,
			),
		failure ? errorMessage(failure) : undefined,
	);
	return {
		...selection,
		refetch: () => {
			for (const query of queries) if (query.isEnabled) void query.refetch();
		},
	};
}
