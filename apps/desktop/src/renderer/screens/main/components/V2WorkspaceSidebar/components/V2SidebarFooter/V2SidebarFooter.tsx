import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuFolderPlus, LuPlus } from "react-icons/lu";
import { SiGithub } from "react-icons/si";
import { AddProjectDialog } from "./components/AddProjectDialog";

interface V2SidebarFooterProps {
	isCollapsed?: boolean;
}

export function V2SidebarFooter({ isCollapsed = false }: V2SidebarFooterProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div
			className={cn(
				"border-t border-border p-2 flex",
				isCollapsed ? "flex-col items-center" : "items-center gap-2",
			)}
		>
			<DropdownMenu>
				{isCollapsed ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-foreground"
								>
									<LuFolderPlus className="size-4" strokeWidth={1.5} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add project</TooltipContent>
					</Tooltip>
				) : (
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
						>
							<LuFolderPlus className="size-4" strokeWidth={1.5} />
							<span>Add project</span>
						</Button>
					</DropdownMenuTrigger>
				)}
				<DropdownMenuContent side="top" align="start">
					<DropdownMenuItem onSelect={() => setIsOpen(true)}>
						<SiGithub className="size-4" />
						From GitHub repository
					</DropdownMenuItem>
					<DropdownMenuItem disabled>
						<LuPlus className="size-4" strokeWidth={1.5} />
						Create blank project
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{isOpen ? (
				<AddProjectDialog open={isOpen} onOpenChange={setIsOpen} />
			) : null}
		</div>
	);
}
