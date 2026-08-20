import { REVIEW_FIXTURE } from "../../fixtures/reviewFixtures";
import { HighRiskSidebar } from "./components/HighRiskSidebar";
import { ReviewDescriptionPane } from "./components/ReviewDescriptionPane";

interface PullRequestReviewTabProps {
	prBody: string;
}

/**
 * PLACEHOLDER DATA — the right-hand risk summary reads from REVIEW_FIXTURE,
 * not from this PR's actual diff. No risk-classification backend exists yet;
 * swap the fixture import for a real query once one ships.
 */
export function PullRequestReviewTab({ prBody }: PullRequestReviewTabProps) {
	return (
		<div className="grid w-full gap-6 px-4 py-6 @md:px-6 @4xl:grid-cols-[minmax(0,40rem)_1fr] @4xl:py-8">
			<ReviewDescriptionPane prBody={prBody} reviewData={REVIEW_FIXTURE} />
			<aside className="min-w-0 @4xl:sticky @4xl:top-6 @4xl:self-start">
				<HighRiskSidebar data={REVIEW_FIXTURE} />
			</aside>
		</div>
	);
}
