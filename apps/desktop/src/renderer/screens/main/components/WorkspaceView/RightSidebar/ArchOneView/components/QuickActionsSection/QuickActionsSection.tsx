import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { IconType } from "react-icons/lib";
import {
	LuChevronDown,
	LuChevronRight,
	LuPlay,
	LuRefreshCw,
	LuZap,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface QuickAction {
	label: string;
	command: string;
	icon: IconType;
}

const QUICK_ACTIONS: QuickAction[] = [
	{ label: "Full Stack Dev", command: "npm run dev", icon: LuPlay },
	{
		label: "Dev Detached",
		command: "npm run dev:detached",
		icon: LuPlay,
	},
	{ label: "Reset DB", command: "npm run dev:resetdb", icon: LuRefreshCw },
];

export function QuickActionsSection() {
	const [collapsed, setCollapsed] = useState(false);
	const { workspaceId } = useParams({ strict: false });
	const addPane = useTabsStore((s) => s.addPane);
	const tabs = useTabsStore((s) => s.tabs);
	const terminalWrite = electronTrpc.terminal.write.useMutation();

	const handleAction = (command: string) => {
		if (!workspaceId) return;

		const currentTab = tabs.find((t) => t.workspaceId === workspaceId);
		if (!currentTab) return;

		const paneId = addPane(currentTab.id);
		if (paneId) {
			// Small delay to let the terminal initialize before writing
			setTimeout(() => {
				terminalWrite.mutate({
					paneId,
					data: `${command}\r`,
				});
			}, 500);
		}
	};

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuZap className="size-3 shrink-0" />
				<span>Quick Actions</span>
			</button>

			{!collapsed && (
				<div className="px-3 py-2">
					<div className="flex flex-wrap gap-1.5">
						{QUICK_ACTIONS.map((action) => {
							const Icon = action.icon;
							return (
								<Button
									key={action.label}
									variant="outline"
									size="sm"
									onClick={() => handleAction(action.command)}
									className="gap-1.5 text-xs"
								>
									<Icon className="size-3" />
									{action.label}
								</Button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
