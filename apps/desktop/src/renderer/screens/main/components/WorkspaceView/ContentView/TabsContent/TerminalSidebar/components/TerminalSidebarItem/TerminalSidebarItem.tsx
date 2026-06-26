import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { LuFileText, LuGlobe, LuMessageSquare, LuTerminal } from "react-icons/lu";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { Pane, PaneStatus, PaneType, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

interface TerminalSidebarItemProps {
	tab: Tab;
	panes: Pane[];
	activePaneId?: string;
	isActive: boolean;
	status: PaneStatus | null;
	onSelect: () => void;
	onRename: (name: string) => void;
	onClose: () => void;
}

function getPaneTypeIcon(type: PaneType | undefined) {
	switch (type) {
		case "chat":
			return LuMessageSquare;
		case "webview":
			return LuGlobe;
		case "file-viewer":
			return LuFileText;
		default:
			return LuTerminal;
	}
}

function formatSubtitle(panes: Pane[], activePaneId?: string): string {
	const activePane = panes.find((pane) => pane.id === activePaneId) ?? panes[0];
	const cwd = activePane?.cwd?.trim();
	if (cwd) {
		const parts = cwd.split("/").filter(Boolean);
		if (parts.length >= 2) {
			return parts.slice(-2).join("/");
		}
		return parts[0] || cwd;
	}

	return panes.length === 1 ? "1 pane" : `${panes.length} panes`;
}

export function TerminalSidebarItem({
	tab,
	panes,
	activePaneId,
	isActive,
	status,
	onSelect,
	onRename,
	onClose,
}: TerminalSidebarItemProps) {
	const displayName = getTabDisplayName(tab);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(displayName);
	const activePane = useMemo(
		() => panes.find((pane) => pane.id === activePaneId) ?? panes[0],
		[activePaneId, panes],
	);
	const subtitle = useMemo(
		() => formatSubtitle(panes, activePaneId),
		[activePaneId, panes],
	);
	const Icon = getPaneTypeIcon(activePane?.type);

	const handleStartEditing = () => {
		setEditValue(displayName);
		setIsEditing(true);
	};

	const handleSave = () => {
		const trimmedValue = editValue.trim();
		if (trimmedValue && trimmedValue !== displayName) {
			onRename(trimmedValue);
		}
		setIsEditing(false);
	};

	return (
		<div
			className={cn(
				"group relative rounded-lg border transition-colors",
				isActive
					? "border-border bg-accent/60 text-foreground"
					: "border-transparent text-muted-foreground hover:border-border/60 hover:bg-accent/30 hover:text-foreground",
			)}
		>
			{isEditing ? (
				<div className="px-3 py-2">
					<RenameInput
						value={editValue}
						onChange={setEditValue}
						onSubmit={handleSave}
						onCancel={() => setIsEditing(false)}
						maxLength={64}
						className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
			) : (
				<>
					<button
						type="button"
						onClick={onSelect}
						onDoubleClick={handleStartEditing}
						className="flex w-full items-start gap-3 px-3 py-2 text-left"
					>
						<div className="mt-0.5 shrink-0 text-muted-foreground">
							<Icon className="size-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate text-sm font-medium">{displayName}</span>
								{status && status !== "idle" && <StatusIndicator status={status} />}
							</div>
							<div className="truncate text-xs text-muted-foreground/80">
								{subtitle}
							</div>
						</div>
					</button>
					<div className="absolute right-2 top-2 hidden group-hover:block">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 text-muted-foreground hover:text-foreground"
							onClick={(event) => {
								event.stopPropagation();
								onClose();
							}}
						>
							<HiMiniXMark className="size-4" />
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
