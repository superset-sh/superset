import { createFileRoute } from "@tanstack/react-router";
import { GoGitPullRequest } from "react-icons/go";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/",
)({
	component: PullRequestsIndexPage,
});

function PullRequestsIndexPage() {
	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
				<GoGitPullRequest className="size-8" />
				<span className="text-sm">Select a pull request to preview it.</span>
			</div>
		</div>
	);
}
