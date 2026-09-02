import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { GoGitPullRequest } from "react-icons/go";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/",
)({
	component: PullRequestsIndexPage,
});

function PullRequestsIndexPage() {
	return (
		<div className="flex h-full flex-1 items-center justify-center p-8">
			<div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
				<GoGitPullRequest className="size-8" />
				<span className="max-w-prose text-sm text-wrap-pretty">
					<Trans id="dashboard.pullRequests.emptyPreviewHint">
						Select a pull request to preview it here.
					</Trans>
				</span>
			</div>
		</div>
	);
}
