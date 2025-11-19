import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { ScrollArea, ScrollBar } from "@superset/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { type MotionValue, motion, useTransform } from "framer-motion";
import { Plus } from "lucide-react";
import type { Workspace } from "shared/types";
import { getWorkspaceIcon } from "../../utils";

interface WorkspaceSwitcherProps {
	workspaces: Workspace[];
	currentWorkspaceId: string | null;
	onWorkspaceSelect: (workspaceId: string) => void;
	onAddWorkspace: () => void;
	onRemoveWorkspace: (workspaceId: string, workspaceName: string) => void;
	scrollProgress: MotionValue<number>;
}

export function WorkspaceSwitcher({
	workspaces,
	currentWorkspaceId,
	onWorkspaceSelect,
	onAddWorkspace,
	onRemoveWorkspace,
	scrollProgress,
}: WorkspaceSwitcherProps) {
	// Calculate sliding background position from scroll progress
	// Button size: 32px (size-8), Gap: 8px (gap-2), Total spacing: 40px per workspace
	const backgroundX = useTransform(scrollProgress, (value) => value * 40);
	return (
		<div className="flex w-full">
			<ScrollArea className="flex-1 min-w-0">
				<div className="relative flex items-center gap-2 px-2 py-2 w-max">
					{/* Sliding background indicator */}
					<motion.div
						className="absolute w-8 h-8 bg-neutral-800 rounded-md"
						style={{ x: backgroundX }}
						initial={false}
						transition={{
							type: "spring",
							stiffness: 300,
							damping: 30,
						}}
					/>

					{workspaces.map((ws) => {
						const Icon = getWorkspaceIcon(ws.id);
						return (
							<ContextMenu key={ws.id}>
								<Tooltip>
									<ContextMenuTrigger asChild>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => onWorkspaceSelect(ws.id)}
												className="relative z-10"
											>
												<Icon size={18} />
											</Button>
										</TooltipTrigger>
									</ContextMenuTrigger>
									<TooltipContent side="top">
										<p>{ws.name}</p>
									</TooltipContent>
									<ContextMenuContent>
										<ContextMenuItem
											className="text-red-400 focus:text-red-400"
											onClick={() => onRemoveWorkspace(ws.id, ws.name)}
										>
											Remove Workspace
										</ContextMenuItem>
									</ContextMenuContent>
								</Tooltip>
							</ContextMenu>
						);
					})}
				</div>
				<ScrollBar orientation="horizontal" className="invisible" />
			</ScrollArea>
			<div className="flex-shrink-0 px-2 py-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" onClick={onAddWorkspace}>
							<Plus size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">
						<p>Add workspace</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
