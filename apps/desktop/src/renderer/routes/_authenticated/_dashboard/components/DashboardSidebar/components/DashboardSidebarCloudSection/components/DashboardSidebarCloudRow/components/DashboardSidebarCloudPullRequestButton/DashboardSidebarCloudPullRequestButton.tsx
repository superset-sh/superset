import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
	type PullRequestDisplayState,
	toPullRequestDisplayState,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";

const LABEL: Record<PullRequestDisplayState, MessageDescriptor> = {
	open: msg({ message: "Open", context: "status" }),
	draft: msg({ message: "Draft" }),
	merged: msg({ message: "Merged" }),
	closed: msg({ message: "Closed" }),
};

interface DashboardSidebarCloudPullRequestButtonProps {
	pullRequest: Pick<CloudPullRequest, "number" | "state" | "isDraft">;
	onClick: () => void;
}

export function DashboardSidebarCloudPullRequestButton({
	pullRequest,
	onClick,
}: DashboardSidebarCloudPullRequestButtonProps) {
	const { t, i18n } = useLingui();
	const { number } = pullRequest;
	const state = toPullRequestDisplayState(pullRequest);
	const Icon = PULL_REQUEST_ICON[state];
	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onClick();
					}}
					aria-label={t({ message: `Open pull request #${number}` })}
					className={cn(
						"flex size-5 items-center justify-center rounded hover:bg-foreground/10",
						PULL_REQUEST_COLOR[state],
					)}
				>
					<Icon className="size-3.5" strokeWidth={1.75} />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				<Trans>
					PR #{number} — {i18n._(LABEL[state])}
				</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
