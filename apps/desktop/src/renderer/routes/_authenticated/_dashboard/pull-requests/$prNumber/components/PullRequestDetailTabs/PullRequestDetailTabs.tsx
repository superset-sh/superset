import { ScrollArea } from "@superset/ui/scroll-area";
import { TabsContent } from "@superset/ui/tabs";
import type { PullRequestCheck } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";
import { PullRequestChecksTab } from "../PullRequestChecksTab";
import { PullRequestCodeTab } from "../PullRequestCodeTab";
import { PullRequestReviewTab } from "../PullRequestReviewTab";
import { PullRequestSummaryTab } from "../PullRequestSummaryTab";

export const PULL_REQUEST_DETAIL_TABS = [
	"review",
	"summary",
	"code",
	"checks",
] as const;
export type PullRequestDetailTab = (typeof PULL_REQUEST_DETAIL_TABS)[number];

interface PullRequestDetailTabsProps {
	projectId: string;
	prNumber: number;
	prUrl: string;
	hostUrl: string;
	body: string;
	checks: PullRequestCheck[];
}

/**
 * The four tab bodies only — the `<Tabs>` root and tab strip live in
 * `page.tsx`/`PullRequestTabBar` above the title, per the Figma layout
 * (ButtonsBar sits above PRTitle, not below it).
 */
export function PullRequestDetailTabs({
	projectId,
	prNumber,
	prUrl,
	hostUrl,
	body,
	checks,
}: PullRequestDetailTabsProps) {
	return (
		<>
			<TabsContent
				value="review"
				className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
			>
				<ScrollArea className="min-h-0 flex-1">
					<PullRequestReviewTab prBody={body} />
				</ScrollArea>
			</TabsContent>

			<TabsContent
				value="summary"
				className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
			>
				<ScrollArea className="min-h-0 flex-1">
					<PullRequestSummaryTab body={body} checks={checks} />
				</ScrollArea>
			</TabsContent>

			<TabsContent
				value="code"
				className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
			>
				<PullRequestCodeTab
					projectId={projectId}
					prNumber={prNumber}
					prUrl={prUrl}
					hostUrl={hostUrl}
				/>
			</TabsContent>

			<TabsContent
				value="checks"
				className="mt-0 flex min-h-0 flex-1 flex-col outline-none"
			>
				<ScrollArea className="min-h-0 flex-1">
					<PullRequestChecksTab checks={checks} />
				</ScrollArea>
			</TabsContent>
		</>
	);
}
