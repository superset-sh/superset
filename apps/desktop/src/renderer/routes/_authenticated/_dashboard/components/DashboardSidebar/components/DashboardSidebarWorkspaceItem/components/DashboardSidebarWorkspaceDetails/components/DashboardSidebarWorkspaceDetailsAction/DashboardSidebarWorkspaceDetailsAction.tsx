import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface DashboardSidebarWorkspaceDetailsActionProps {
	label: string;
	icon: ReactNode;
	busy?: boolean;
	onClick: () => void;
}

/**
 * Compact icon button shown on hover in a workspace detail section header
 * (e.g. "close all ports"). A section contributes one via `headerAction`.
 */
export function DashboardSidebarWorkspaceDetailsAction({
	label,
	icon,
	busy = false,
	onClick,
}: DashboardSidebarWorkspaceDetailsActionProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-busy={busy}
					disabled={busy}
					onClick={(event) => {
						event.stopPropagation();
						if (busy) return;
						onClick();
					}}
					className={cn(
						"rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-primary",
						"disabled:pointer-events-none disabled:opacity-60",
					)}
				>
					{busy ? (
						<LuLoaderCircle
							className="size-3 animate-spin"
							strokeWidth={STROKE_WIDTH}
						/>
					) : (
						icon
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={4}>
				<p className="text-xs">{label}</p>
			</TooltipContent>
		</Tooltip>
	);
}
