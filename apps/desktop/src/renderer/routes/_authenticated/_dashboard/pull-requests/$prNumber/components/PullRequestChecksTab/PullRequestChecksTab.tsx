import { PullRequestChecksSection } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSection";
import type { PullRequestCheck } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";

interface PullRequestChecksTabProps {
	checks: PullRequestCheck[];
}

export function PullRequestChecksTab({ checks }: PullRequestChecksTabProps) {
	return (
		<div className="w-full max-w-3xl px-4 py-6 @md:px-6 @4xl:py-8">
			<PullRequestChecksSection checks={checks} />
		</div>
	);
}
