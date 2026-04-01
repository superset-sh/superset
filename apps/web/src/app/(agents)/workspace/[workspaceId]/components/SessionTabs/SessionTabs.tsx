"use client";

import { cn } from "@superset/ui/utils";

type SessionTabsProps = {
	activeTab: "chat" | "diff";
	onTabChange: (tab: "chat" | "diff") => void;
};

const tabIds = {
	chat: "session-tab-chat",
	diff: "session-tab-diff",
} as const;

const panelIds = {
	chat: "session-panel-chat",
	diff: "session-panel-diff",
} as const;

export function SessionTabs({ activeTab, onTabChange }: SessionTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="Session view"
			className="flex shrink-0 border-b border-border px-4"
		>
			<button
				type="button"
				role="tab"
				id={tabIds.chat}
				aria-selected={activeTab === "chat"}
				aria-controls={panelIds.chat}
				tabIndex={activeTab === "chat" ? 0 : -1}
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
				role="tab"
				id={tabIds.diff}
				aria-selected={activeTab === "diff"}
				aria-controls={panelIds.diff}
				tabIndex={activeTab === "diff" ? 0 : -1}
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
