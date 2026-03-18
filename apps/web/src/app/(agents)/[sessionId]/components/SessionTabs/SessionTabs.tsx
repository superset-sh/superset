"use client";

import { cn } from "@superset/ui/utils";

type SessionTabsProps = {
	activeTab: "chat" | "diff";
	onTabChange: (tab: "chat" | "diff") => void;
};

export function SessionTabs({ activeTab, onTabChange }: SessionTabsProps) {
	return (
		<div className="flex shrink-0 border-b border-border px-4">
			<button
				type="button"
				onClick={() => onTabChange("chat")}
				className={cn(
					"relative px-4 py-2 text-sm font-medium transition-colors",
					activeTab === "chat"
						? "text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Chat
				{activeTab === "chat" && (
					<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
				)}
			</button>
			<button
				type="button"
				onClick={() => onTabChange("diff")}
				className={cn(
					"relative px-4 py-2 text-sm font-medium transition-colors",
					activeTab === "diff"
						? "text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Diff
				{activeTab === "diff" && (
					<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
				)}
			</button>
		</div>
	);
}
