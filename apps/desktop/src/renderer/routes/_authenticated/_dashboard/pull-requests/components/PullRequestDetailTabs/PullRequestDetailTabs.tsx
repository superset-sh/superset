import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

export type PullRequestDetailTab = "summary" | "code";

interface PullRequestDetailTabsProps {
	activeTab: PullRequestDetailTab;
	onTabChange: (tab: PullRequestDetailTab) => void;
	className?: string;
}

export function PullRequestDetailTabs({
	activeTab,
	onTabChange,
	className,
}: PullRequestDetailTabsProps) {
	const { t } = useLingui();
	const tabs: ReadonlyArray<{ value: PullRequestDetailTab; label: string }> = [
		{ value: "summary", label: t({ message: "Summary" }) },
		{ value: "code", label: t({ message: "Code" }) },
	];
	return (
		<div className={cn("flex items-center gap-1", className)}>
			{tabs.map(({ value, label }) => (
				<button
					key={value}
					type="button"
					onClick={() => onTabChange(value)}
					aria-current={activeTab === value ? "true" : undefined}
					className={cn(
						"rounded-md px-2 py-1 text-xs font-medium transition-colors",
						activeTab === value
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{label}
				</button>
			))}
		</div>
	);
}
