import { useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuSearch } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { useHotkeyDisplay } from "renderer/hotkeys";
import supersetEmptyStateWordmark from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/assets/superset-empty-state-wordmark.svg";
import { EmptyTabActionButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/components/EmptyTabActionButton";
import { useTheme } from "renderer/stores/theme";

interface WorkspaceEmptyStateProps {
	onOpenBrowser: () => void;
	onOpenChat: () => void;
	onOpenQuickOpen: () => void;
	onOpenTerminal: () => void;
}

interface WorkspaceEmptyStateAction {
	display: string[];
	icon: IconType;
	id: string;
	label: string;
	onClick: () => void;
}

export function WorkspaceEmptyState({
	onOpenBrowser,
	onOpenChat,
	onOpenQuickOpen,
	onOpenTerminal,
}: WorkspaceEmptyStateProps) {
	const activeTheme = useTheme();
	const { keys: newGroupDisplay } = useHotkeyDisplay("NEW_GROUP");
	const { keys: newChatDisplay } = useHotkeyDisplay("NEW_CHAT");
	const { keys: newBrowserDisplay } = useHotkeyDisplay("NEW_BROWSER");
	const { keys: quickOpenDisplay } = useHotkeyDisplay("QUICK_OPEN");

	const actions = useMemo<Array<WorkspaceEmptyStateAction>>(
		() => [
			{
				id: "terminal",
				label: "Open Terminal",
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: onOpenTerminal,
			},
			{
				id: "chat",
				label: "Open Chat",
				display: newChatDisplay,
				icon: TbMessageCirclePlus,
				onClick: onOpenChat,
			},
			{
				id: "browser",
				label: "Open Browser",
				display: newBrowserDisplay,
				icon: TbWorld,
				onClick: onOpenBrowser,
			},
			{
				id: "search-files",
				label: "Search Files",
				display: quickOpenDisplay,
				icon: LuSearch,
				onClick: onOpenQuickOpen,
			},
		],
		[
			newBrowserDisplay,
			newChatDisplay,
			newGroupDisplay,
			onOpenBrowser,
			onOpenChat,
			onOpenQuickOpen,
			onOpenTerminal,
			quickOpenDisplay,
		],
	);

	return (
		<div className="flex h-full flex-1 items-center justify-center px-6 py-10">
			<div className="w-full max-w-xl">
				<div className="mb-7 flex items-center justify-center py-3">
					<img
						alt="Superset"
						className={`h-8 w-auto select-none ${
							activeTheme?.type === "dark"
								? "opacity-85"
								: "brightness-0 opacity-75"
						}`}
						draggable={false}
						src={supersetEmptyStateWordmark}
					/>
				</div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<EmptyTabActionButton
							key={action.id}
							display={action.display}
							icon={action.icon}
							label={action.label}
							onClick={action.onClick}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
