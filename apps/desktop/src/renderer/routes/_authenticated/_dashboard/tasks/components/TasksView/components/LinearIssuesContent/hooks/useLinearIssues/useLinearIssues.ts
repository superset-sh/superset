import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { TabValue } from "../../../TasksTopBar";

const SEARCH_DEBOUNCE_MS = 300;
const ISSUES_STALE_MS = 30_000;

export interface LinearIssueFilters {
	teamId: string | null;
	status: TabValue;
	assignee: string | null;
	search: string;
}

export function useLinearIssues(filters: LinearIssueFilters) {
	const organizationId = useActiveOrganizationId();
	const search = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);

	const query = cloudTrpc.integration.linear.issues.useInfiniteQuery(
		{
			organizationId: organizationId ?? "",
			teamId: filters.teamId,
			status: filters.status,
			assignee: filters.assignee,
			search: search || null,
		},
		{
			enabled: !!organizationId,
			getNextPageParam: (page) => page.nextCursor,
			staleTime: ISSUES_STALE_MS,
			retry: false,
		},
	);

	const issues = useMemo(
		() => query.data?.pages.flatMap((page) => page.issues) ?? [],
		[query.data],
	);

	return { ...query, issues };
}
