import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuCheck, LuCopy, LuMaximize2 } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { PullRequestPaneData } from "../../../../../../types";

interface PullRequestPaneHeaderExtrasProps {
	data: PullRequestPaneData;
}

/**
 * Jump from the pane to the full Pull requests screen, where the Code tab
 * and the PR list live. Hidden for session workspaces (null projectId):
 * that route is project-scoped.
 */
export function PullRequestPaneHeaderExtras({
	data,
}: PullRequestPaneHeaderExtrasProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { workspace, hostUrl } = useWorkspace();
	const { copyToClipboard, copied } = useCopyToClipboard();
	const projectId = workspace.projectId;
	const detail = usePullRequestDetail({
		projectId,
		hostUrl,
		prNumber: data.prNumber,
	});
	const url = detail.data?.url;
	const copyLabel = copied
		? t({ message: "Copied" })
		: t({ message: "Copy link to pull request" });
	if (projectId == null) return null;

	return (
		<>
			{url && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => {
								void copyToClipboard(url).catch(() => {
									toast.error(t({ message: "Failed to copy to clipboard" }));
								});
							}}
							aria-label={copyLabel}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							{copied ? (
								<LuCheck className="size-3.5" />
							) : (
								<LuCopy className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{copyLabel}</TooltipContent>
				</Tooltip>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => {
							// Same pair the PR list's own row click performs — the detail
							// pane may have been collapsed the last time the view was open.
							usePullRequestsSplitViewStore.getState().expandDetail();
							void navigate({
								to: "/pull-requests/$prNumber",
								params: { prNumber: String(data.prNumber) },
								search: { project: projectId },
							});
						}}
						aria-label={t({
							message: "Open in Pull Requests",
						})}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<LuMaximize2 className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Open in Pull Requests</Trans>
				</TooltipContent>
			</Tooltip>
		</>
	);
}
