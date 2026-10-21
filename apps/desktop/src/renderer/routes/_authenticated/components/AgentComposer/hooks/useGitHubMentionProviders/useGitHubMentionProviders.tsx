import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import {
	linkedIssueChip,
	linkedPrChip,
	linkedRefFromText,
} from "../../utils/linkedContextChips";

const MAX_RESULTS = 20;

/** A repository reached through its host; the chat pane has one per workspace, the modal per project. */
export type GitHubRepo = { projectId: string; hostUrl: string };

function normalizePrState(state: string, isDraft: boolean): string {
	if (isDraft) return "draft";
	return state.toLowerCase();
}

function prState(pr: LinkedPR) {
	return pr.state === "draft" || pr.state === "merged" || pr.state === "closed"
		? pr.state
		: "open";
}

/** The repo's GitHub issues and pull requests as @-mentions, scoped like `files` is. */
export function useGitHubMentionProviders(
	repo: GitHubRepo | null,
): ComposerMentionProvider[] {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	return useMemo(() => {
		if (!repo) return [];
		const { projectId, hostUrl } = repo;
		const client = () => getHostServiceClientByUrl(hostUrl);
		const issueEntry = (issue: LinkedIssue): ComposerMentionEntry => ({
			id: issue.url ?? issue.slug,
			label: issue.slug,
			description: issue.title,
			icon:
				issue.state === "closed" ? (
					<GoIssueClosed className="size-4 text-purple-500" />
				) : (
					<GoIssueOpened className="size-4 text-emerald-500" />
				),
			select: (ctx) => ctx.insertChip(linkedIssueChip(issue, isDark)),
		});
		const prEntry = (pr: LinkedPR): ComposerMentionEntry => {
			const Icon = PULL_REQUEST_ICON[prState(pr)];
			return {
				id: pr.url,
				label: `#${pr.prNumber}`,
				description: pr.title,
				icon: (
					<Icon
						className={cn("size-4", PULL_REQUEST_COLOR[prState(pr)])}
						strokeWidth={1.75}
					/>
				),
				select: (ctx) => ctx.insertChip(linkedPrChip(pr)),
			};
		};
		return [
			{
				id: "github-issues",
				title: t({ message: "GitHub issues" }),
				priority: 4,
				source: {
					kind: "search",
					emptyState: t({ message: "No matching issues" }),
					search: async (query) => {
						// A pasted issue link resolves to that one issue.
						const ref = linkedRefFromText(query);
						if (ref && ref.kind !== "github-issue") return [];
						const { issues } =
							await client().workspaceCreation.searchGitHubIssues.query({
								projectId,
								query: ref ? String(ref.number) : query || undefined,
								limit: MAX_RESULTS,
								includeClosed: ref !== null,
							});
						return issues
							.filter((issue) => !ref || issue.issueNumber === ref.number)
							.map((issue) =>
								issueEntry({
									slug: `#${issue.issueNumber}`,
									title: issue.title,
									source: "github",
									url: issue.url,
									number: issue.issueNumber,
									state:
										issue.state.toLowerCase() === "closed" ? "closed" : "open",
								}),
							);
					},
				},
			},
			{
				id: "pull-requests",
				title: t({ message: "Pull requests" }),
				priority: 5,
				source: {
					kind: "search",
					emptyState: t({ message: "No matching pull requests" }),
					search: async (query) => {
						const ref = linkedRefFromText(query);
						if (ref && ref.kind !== "github-pr") return [];
						const { pullRequests } =
							await client().workspaceCreation.searchPullRequests.query({
								projectId,
								query: ref ? String(ref.number) : query || undefined,
								limit: MAX_RESULTS,
								includeClosed: ref !== null,
							});
						return pullRequests
							.filter((pr) => !ref || pr.prNumber === ref.number)
							.map((pr) =>
								prEntry({
									prNumber: pr.prNumber,
									title: pr.title,
									url: pr.url,
									state: normalizePrState(pr.state, pr.isDraft),
								}),
							);
					},
				},
			},
		];
	}, [isDark, repo, t]);
}
