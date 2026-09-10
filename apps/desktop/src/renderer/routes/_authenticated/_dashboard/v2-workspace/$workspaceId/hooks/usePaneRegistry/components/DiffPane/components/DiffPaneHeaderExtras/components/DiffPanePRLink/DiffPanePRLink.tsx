import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { LuArrowRight } from "react-icons/lu";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../../../../../types";
import { openPullRequestPaneInStore } from "../../../../../../../../utils/openPullRequestPaneInStore";

interface DiffPanePRLinkProps {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

/**
 * Opens the workspace's linked pull request as a pane beside the diff — its
 * summary, checks, and merge actions, without leaving the workspace for
 * the Pull requests screen. Hidden when no PR is linked, and for session
 * workspaces (null projectId): the PR content query is project-scoped and
 * can't resolve a repo without one.
 */
export function DiffPanePRLink({ workspaceId, store }: DiffPanePRLinkProps) {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	// Same query key useDiffAnnotations polls at 10s from inside the pane, so
	// tanstack-query dedupes this into the existing subscription.
	const prQuery = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{ enabled: !!workspaceId, staleTime: 10_000 },
	);
	const pr = prQuery.data;
	const projectId = workspace.projectId;
	if (!pr || projectId == null) return null;

	// Same state derivation as PRStatusGroup's linkState.
	const state: PRState = pr.isDraft
		? "draft"
		: pr.state === "merged"
			? "merged"
			: pr.state === "closed"
				? "closed"
				: pr.state === "queued"
					? "queued"
					: "open";

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => openPullRequestPaneInStore(store, pr.number)}
						aria-label={t({
							message: `Open pull request #${pr.number}`,
						})}
						className="group flex h-5 items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-1.5 transition-colors hover:bg-accent/60"
					>
						<PRIcon state={state} className="size-3.5" />
						{/* Verb-first label: the bare number read as a badge, not as
						    an action that opens the PR. */}
						<span className="font-medium text-[11px] text-foreground tabular-nums">
							{t({
								message: `Open PR #${pr.number}`,
							})}
						</span>
						<LuArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-px" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Open pull request</Trans>
				</TooltipContent>
			</Tooltip>
			{/* Rendered here, not by the parent, so no stray divider shows when
			    the link is hidden (no PR / session workspace). */}
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</>
	);
}
