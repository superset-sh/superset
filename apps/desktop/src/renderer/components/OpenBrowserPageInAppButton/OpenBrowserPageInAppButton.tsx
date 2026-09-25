import { Trans, useLingui } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { AppWindow } from "lucide-react";
import { env } from "renderer/env.renderer";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { getPullRequestTarget } from "./utils/getPullRequestTarget";

export function OpenBrowserPageInAppButton({
	currentUrl,
	onOpenInPane,
}: {
	currentUrl: string;
	onOpenInPane?: (pane: CreatePaneInput<PaneViewerData>) => void;
}) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { projects } = useHostProjects();
	const target = getPullRequestTarget(currentUrl, projects);
	const pageSlug = parseSupersetPageUrl(currentUrl, env.NEXT_PUBLIC_WEB_URL);
	const canOpen =
		pageSlug !== null ||
		(target !== null &&
			(onOpenInPane !== undefined || target.projectId !== null));
	if (!canOpen) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Open in app" })}
					className="flex h-[22px] shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 text-[11px] font-medium leading-none text-accent-foreground transition-colors hover:bg-accent/80"
					onClick={() => {
						if (onOpenInPane) {
							if (pageSlug)
								onOpenInPane({ kind: "page", data: { slug: pageSlug } });
							else if (target)
								onOpenInPane({ kind: "pull-request", data: target.ref });
							return;
						}
						if (pageSlug) {
							void navigate({
								to: "/pages/$slug",
								params: { slug: pageSlug },
							});
							return;
						}
						if (!target?.projectId) return;
						usePullRequestsSplitViewStore.getState().expandDetail();
						void navigate({
							to: "/pull-requests/$prNumber",
							params: { prNumber: String(target.ref.number) },
							search: { project: target.projectId },
						});
					}}
				>
					<AppWindow className="size-3" />
					<span className="hidden @min-[480px]/browser-toolbar:inline whitespace-nowrap">
						<Trans>Open in app</Trans>
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Trans>Open in app</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
