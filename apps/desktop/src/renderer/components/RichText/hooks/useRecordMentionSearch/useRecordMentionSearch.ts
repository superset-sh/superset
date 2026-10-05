import { useCallback } from "react";
import type {
	RecordMentionItem,
	RecordMentionSearchFn,
} from "renderer/components/MarkdownEditor";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useRecordMentionSearch(): RecordMentionSearchFn | undefined {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const search = useCallback(
		async (query: string): Promise<RecordMentionItem[]> => {
			if (!organizationId) return [];
			const found = await utils.mention.search.fetch({
				organizationId,
				query,
			});
			return [
				...found.people.map(
					(person): RecordMentionItem => ({ kind: "person", ...person }),
				),
				...found.tasks.map(
					(task): RecordMentionItem => ({ kind: "task", ...task }),
				),
				...found.pullRequests.map(
					(pullRequest): RecordMentionItem => ({
						kind: "pull_request",
						id: pullRequest.id,
						number: pullRequest.number,
						title: pullRequest.title,
						url: pullRequest.url,
					}),
				),
			];
		},
		[organizationId, utils],
	);
	return organizationId ? search : undefined;
}
