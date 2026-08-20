import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuExternalLink,
	LuPanelLeft,
	LuPlus,
	LuShare,
} from "react-icons/lu";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import { usePullRequestsListPaneStore } from "../../../stores/pullRequestsListPaneStore";

export type PRDetailTab = "review" | "summary" | "code" | "checks";

const TABS: ReadonlyArray<{ value: PRDetailTab; label: string }> = [
	{ value: "review", label: "Review" },
	{ value: "summary", label: "Summary" },
	{ value: "code", label: "Code" },
	{ value: "checks", label: "Checks" },
];

const STATE_PILL_STYLES: Record<PRState, string> = {
	open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	merged:
		"border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	closed:
		"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	draft: "border border-border bg-muted text-muted-foreground",
	queued:
		"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const STATE_LABELS: Record<PRState, string> = {
	open: "Open",
	merged: "Merged",
	closed: "Closed",
	draft: "Draft",
	queued: "Queued",
};

interface PRDetailHeaderProps {
	title: string;
	state: PRState;
	authorLogin: string | null;
	prNumber: number;
	/** ISO timestamp — updatedAt preferred, falls back to createdAt. */
	timestamp: string | undefined;
	url: string;
	activeTab: PRDetailTab;
	onTabChange: (tab: PRDetailTab) => void;
	onAddToWorkspace: () => void;
}

export function PRDetailHeader({
	title,
	state,
	authorLogin,
	prNumber,
	timestamp,
	url,
	activeTab,
	onTabChange,
	onAddToWorkspace,
}: PRDetailHeaderProps) {
	const toggleListCollapsed = usePullRequestsListPaneStore(
		(pane) => pane.toggle,
	);
	const [isCopied, setIsCopied] = useState(false);
	const timeAgo = timestamp
		? `${formatRelativeTime(new Date(timestamp).getTime())} ago`
		: null;

	const handleShare = () => {
		navigator.clipboard
			.writeText(url)
			.then(() => {
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			})
			.catch(() => toast.error("Couldn't copy the pull request link"));
	};

	return (
		<div className="@container flex shrink-0 flex-col gap-1 border-b border-border px-4 py-2 @md:px-6">
			<div className="drag flex items-center justify-between gap-2">
				<div className="no-drag min-w-0">
					<Tabs
						value={activeTab}
						onValueChange={(value) => onTabChange(value as PRDetailTab)}
					>
						<TabsList className="h-auto gap-1 bg-transparent p-0">
							{TABS.map((tab) => (
								<TabsTrigger
									key={tab.value}
									value={tab.value}
									className="rounded-lg border-none bg-transparent px-2 py-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
								>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
				<div className="no-drag flex shrink-0 items-center gap-1.5">
					<Button
						variant="outline"
						size="xs"
						onClick={handleShare}
						aria-label="Copy pull request link"
					>
						{isCopied ? (
							<LuCheck className="size-3.5" />
						) : (
							<LuShare className="size-3.5" />
						)}
						{isCopied ? "Copied" : "Share"}
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={toggleListCollapsed}
						aria-label="Toggle pull request list"
						title="Toggle pull request list"
					>
						<LuPanelLeft className="size-4" />
					</Button>
				</div>
			</div>

			<div className="flex items-center justify-between gap-3 py-1">
				<h1 className="min-w-0 truncate text-xl font-medium leading-tight @md:text-2xl">
					{title}
				</h1>
				<div className="no-drag flex shrink-0 items-center gap-1.5">
					<Button variant="ghost" size="icon-xs" asChild>
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open pull request in GitHub"
							title="Open pull request in GitHub"
						>
							<LuExternalLink className="size-4" />
						</a>
					</Button>
					<Button variant="outline" size="xs" onClick={onAddToWorkspace}>
						<LuPlus className="size-3.5" />
						<span className="hidden @md:inline">Add to workspace</span>
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-2 text-xs">
				<span
					className={cn(
						"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium",
						STATE_PILL_STYLES[state],
					)}
				>
					<PRIcon state={state} className="size-3.5" />
					{STATE_LABELS[state]}
				</span>
				{authorLogin && (
					<span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
						<Avatar className="size-4 rounded-sm">
							<AvatarImage
								src={`https://github.com/${authorLogin}.png?size=32`}
								alt={authorLogin}
							/>
							<AvatarFallback className="rounded-sm text-[8px]">
								{authorLogin.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						{authorLogin}
					</span>
				)}
				<span className="shrink-0 text-muted-foreground">#{prNumber}</span>
				{timeAgo && (
					<span className="shrink-0 text-muted-foreground">{timeAgo}</span>
				)}
			</div>
		</div>
	);
}
