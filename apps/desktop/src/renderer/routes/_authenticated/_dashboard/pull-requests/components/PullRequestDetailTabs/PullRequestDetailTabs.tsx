import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { PullRequestDiffStat } from "../PullRequestDiffStat";

export type PullRequestDetailTab = "summary" | "code";

interface PullRequestDetailTabsProps {
	activeTab: PullRequestDetailTab;
	onTabChange: (tab: PullRequestDetailTab) => void;
	/** Rides after the Changes label once the detail knows its size. */
	diffStat?: { additions: number; deletions: number } | null;
	className?: string;
}

export function PullRequestDetailTabs({
	activeTab,
	onTabChange,
	diffStat,
	className,
}: PullRequestDetailTabsProps) {
	const { t } = useLingui();
	const tabs: ReadonlyArray<{ value: PullRequestDetailTab; label: string }> = [
		{ value: "summary", label: t({ message: "Summary" }) },
		{ value: "code", label: t({ message: "Changes" }) },
	];
	return (
		<nav
			className={cn("flex min-w-0 items-center gap-0.5", className)}
			aria-label={t({ message: "Pull request detail tabs" })}
		>
			{tabs.map(({ value, label }) => (
				<button
					key={value}
					type="button"
					onClick={() => onTabChange(value)}
					aria-pressed={activeTab === value}
					className={cn(
						"inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-normal transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						activeTab === value
							? "bg-secondary text-foreground"
							: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
					)}
				>
					{label}
					{value === "code" && diffStat ? (
						<PullRequestDiffStat
							additions={diffStat.additions}
							deletions={diffStat.deletions}
							className="text-[11px] @max-[30rem]/topbar:hidden"
						/>
					) : null}
				</button>
			))}
		</nav>
	);
}
