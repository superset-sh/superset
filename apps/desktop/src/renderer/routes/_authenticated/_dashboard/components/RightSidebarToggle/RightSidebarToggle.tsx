import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";

interface RightSidebarToggleProps {
	isOpen: boolean;
	onToggle: () => void;
	compact?: boolean;
}

export function RightSidebarToggle({
	isOpen,
	onToggle,
	compact = false,
}: RightSidebarToggleProps) {
	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<LuPanelRightOpen className="size-4" strokeWidth={1.5} />
			) : (
				<LuPanelRight className="size-4" strokeWidth={1.5} />
			);
		}
		return isHovering ? (
			<LuPanelRightClose className="size-4" strokeWidth={1.5} />
		) : (
			<LuPanelRight className="size-4" strokeWidth={1.5} />
		);
	};

	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onToggle}
					className={cn(
						"no-drag group flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
						compact ? "size-7" : "size-8",
					)}
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">
				<HotkeyLabel fallbackLabel="Toggle sidebar" id="TOGGLE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
