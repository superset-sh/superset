import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuGitPullRequest } from "react-icons/lu";
import { RecordInlineLink } from "renderer/routes/_authenticated/_dashboard/components/RecordInlineLink";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
	toPullRequestDisplayState,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";

interface PullRequestLinkProps {
	number: number;
	pullRequest: Pick<CloudPullRequest, "title" | "state" | "isDraft"> | null;
	fallbackTitle?: ReactNode;
	onOpen: () => void;
}

export function PullRequestLink({
	number,
	pullRequest,
	fallbackTitle,
	onOpen,
}: PullRequestLinkProps) {
	const state = pullRequest ? toPullRequestDisplayState(pullRequest) : null;
	const Icon = state ? PULL_REQUEST_ICON[state] : LuGitPullRequest;
	return (
		<RecordInlineLink
			icon={
				<Icon
					className={cn(
						"size-3.5",
						state ? PULL_REQUEST_COLOR[state] : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			}
			onClick={onOpen}
		>
			<span className="font-normal text-muted-foreground">#{number}</span>{" "}
			{pullRequest ? pullRequest.title : fallbackTitle}
		</RecordInlineLink>
	);
}
