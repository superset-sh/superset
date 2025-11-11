import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type React from "react";

interface SidebarToggleProps {
	isOpen: boolean;
	onCollapse: () => void;
	onExpand: () => void;
}

export const SidebarToggle: React.FC<SidebarToggleProps> = ({
	isOpen,
	onCollapse,
	onExpand,
}) => (
	<div className="flex items-center gap-1 mr-2">
		{isOpen ? (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon-sm" onClick={onCollapse}>
						<PanelLeftClose size={16} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>Collapse sidebar</p>
				</TooltipContent>
			</Tooltip>
		) : (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="ghost" size="icon-sm" onClick={onExpand}>
						<PanelLeftOpen size={16} />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>Expand sidebar</p>
				</TooltipContent>
			</Tooltip>
		)}
	</div>
);
