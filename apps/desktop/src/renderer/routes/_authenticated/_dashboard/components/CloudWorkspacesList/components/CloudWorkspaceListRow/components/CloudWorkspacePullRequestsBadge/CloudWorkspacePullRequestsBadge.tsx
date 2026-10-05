import { Trans } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
	toPullRequestDisplayState,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";
import { CloudWorkspaceRowChip } from "../CloudWorkspaceRowChip";

interface CloudWorkspacePullRequestsBadgeProps {
	pullRequests: CloudPullRequest[];
	onOpenPullRequest: (url: string) => void;
}

export function CloudWorkspacePullRequestsBadge({
	pullRequests,
	onOpenPullRequest,
}: CloudWorkspacePullRequestsBadgeProps) {
	const [first] = pullRequests;
	if (!first) return null;
	const state = toPullRequestDisplayState(first);
	const Icon = PULL_REQUEST_ICON[state];
	return (
		<HoverCard openDelay={150} closeDelay={100}>
			<HoverCardTrigger asChild>
				<CloudWorkspaceRowChip
					onClick={(event) => {
						event.stopPropagation();
						if (pullRequests.length === 1) onOpenPullRequest(first.url);
					}}
				>
					<Icon
						className={cn("size-3", PULL_REQUEST_COLOR[state])}
						strokeWidth={2}
					/>
					#{first.number}
					{pullRequests.length > 1 && (
						<span className="text-muted-foreground/70">
							+{pullRequests.length - 1}
						</span>
					)}
				</CloudWorkspaceRowChip>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-80 p-1 pt-2"
				onClick={(event) => event.stopPropagation()}
			>
				<CloudSection title={<Trans>Pull requests</Trans>}>
					{pullRequests.map((pullRequest) => (
						<CloudPullRequestRow
							key={pullRequest.url}
							pullRequest={pullRequest}
							onOpen={() => onOpenPullRequest(pullRequest.url)}
						/>
					))}
				</CloudSection>
			</HoverCardContent>
		</HoverCard>
	);
}
