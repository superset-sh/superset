import { cn } from "@superset/ui/utils";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
	toPullRequestDisplayState,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";

interface CloudPullRequestRowProps {
	pullRequest: CloudPullRequest;
	onOpen: () => void;
}

export function CloudPullRequestRow({
	pullRequest,
	onOpen,
}: CloudPullRequestRowProps) {
	const state = toPullRequestDisplayState(pullRequest);
	const Icon = PULL_REQUEST_ICON[state];
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex h-7 w-fit max-w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-fill-hover"
		>
			<Icon
				className={cn("size-3.5 shrink-0", PULL_REQUEST_COLOR[state])}
				strokeWidth={1.75}
			/>
			<span className="shrink-0 tabular-nums text-muted-foreground">
				#{pullRequest.number}
			</span>
			<span className="min-w-0 truncate">{pullRequest.title}</span>
			<span className="shrink-0 font-mono text-[11px] tabular-nums">
				<span className="text-emerald-500">+{pullRequest.additions}</span>{" "}
				<span className="text-destructive">−{pullRequest.deletions}</span>
			</span>
		</button>
	);
}
