import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import {
	useEffectiveHotkeysMap,
	useHotkeysStore,
} from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { formatHotkeyText } from "shared/hotkeys";

interface V2SidebarHeaderProps {
	isCollapsed?: boolean;
}

export function V2SidebarHeader({ isCollapsed = false }: V2SidebarHeaderProps) {
	const openModal = useOpenNewWorkspaceModal();
	const platform = useHotkeysStore((state) => state.platform);
	const effective = useEffectiveHotkeysMap();
	const shortcutText = formatHotkeyText(effective.NEW_WORKSPACE, platform);

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => openModal()}
							className="group flex items-center justify-center size-8 rounded-md bg-accent/40 hover:bg-accent/60 transition-colors"
						>
							<div className="flex items-center justify-center size-5 rounded bg-accent">
								<LuPlus className="size-3" strokeWidth={2} />
							</div>
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						New Workspace ({shortcutText})
					</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="border-b border-border px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={() => openModal()}
				className="group flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/40 hover:bg-accent/60 rounded-md transition-colors"
			>
				<div className="flex items-center justify-center size-5 rounded bg-accent">
					<LuPlus className="size-3" strokeWidth={2} />
				</div>
				<span className="flex-1 text-left">New Workspace</span>
				<span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors font-mono tabular-nums shrink-0">
					{shortcutText}
				</span>
			</button>
		</div>
	);
}
