import { TabsList, TabsTrigger } from "@superset/ui/tabs";
import { PULL_REQUEST_DETAIL_TABS } from "../PullRequestDetailTabs";

const TAB_LABELS: Record<(typeof PULL_REQUEST_DETAIL_TABS)[number], string> = {
	review: "Review",
	summary: "Summary",
	code: "Code",
	checks: "Checks",
};

export function PullRequestTabBar() {
	return (
		<TabsList className="h-auto w-fit gap-3 rounded-none bg-transparent p-0">
			{PULL_REQUEST_DETAIL_TABS.map((tab) => (
				<TabsTrigger
					key={tab}
					value={tab}
					className="h-auto rounded-lg border-none px-2 py-1 text-xs font-medium text-[#6e6c6a] shadow-none data-[state=active]:bg-[#eae8e6] data-[state=active]:text-[#373533] data-[state=active]:shadow-none dark:text-muted-foreground dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground"
				>
					{TAB_LABELS[tab]}
				</TabsTrigger>
			))}
		</TabsList>
	);
}
