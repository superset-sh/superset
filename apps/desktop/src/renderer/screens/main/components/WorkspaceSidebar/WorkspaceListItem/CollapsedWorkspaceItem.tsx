import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { RefObject } from "react";
import { LuCopy, LuX } from "react-icons/lu";
import type { ActivePaneStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";
import { DeleteWorkspaceDialog, WorkspaceHoverCardContent } from "./components";
import { HOVER_CARD_CLOSE_DELAY, HOVER_CARD_OPEN_DELAY } from "./constants";
import { WorkspaceIcon } from "./WorkspaceIcon";

interface CollapsedWorkspaceItemProps {
	id: string;
	name: string;
	branch: string;
	type: "worktree" | "branch";
	isActive: boolean;
	isUnread: boolean;
	workspaceStatus: ActivePaneStatus | null;
	itemRef: RefObject<HTMLElement | null>;
	showDeleteDialog: boolean;
	setShowDeleteDialog: (open: boolean) => void;
	onMouseEnter: () => void;
	onClick: () => void;
	onDeleteClick: () => void;
	onCopyPath: () => void;
}

export function CollapsedWorkspaceItem({
	id,
	name,
	branch,
	type,
	isActive,
	isUnread,
	workspaceStatus,
	itemRef,
	showDeleteDialog,
	setShowDeleteDialog,
	onMouseEnter,
	onClick,
	onDeleteClick,
	onCopyPath,
}: CollapsedWorkspaceItemProps) {
	const isBranchWorkspace = type === "branch";

	const collapsedButton = (
		<button
			ref={(node) => {
				(itemRef as React.MutableRefObject<HTMLElement | null>).current = node;
			}}
			type="button"
			onClick={onClick}
			onAuxClick={(e) => {
				if (e.button === 1) {
					e.preventDefault();
					onDeleteClick();
				}
			}}
			onMouseEnter={onMouseEnter}
			className={cn(
				"relative flex items-center justify-center size-8 rounded-md",
				"hover:bg-muted/50 transition-colors",
				isActive && "bg-muted",
			)}
		>
			<WorkspaceIcon
				isBranchWorkspace={isBranchWorkspace}
				isActive={isActive}
				isUnread={isUnread}
				workspaceStatus={workspaceStatus}
				variant="collapsed"
			/>
		</button>
	);

	if (isBranchWorkspace) {
		return (
			<>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>{collapsedButton}</TooltipTrigger>
					<TooltipContent side="right" className="flex flex-col gap-0.5">
						<span className="font-medium">local</span>
						<span className="text-xs text-muted-foreground font-mono">
							{branch}
						</span>
					</TooltipContent>
				</Tooltip>
				<DeleteWorkspaceDialog
					workspaceId={id}
					workspaceName={name}
					workspaceType={type}
					open={showDeleteDialog}
					onOpenChange={setShowDeleteDialog}
				/>
			</>
		);
	}

	return (
		<>
			<HoverCard
				openDelay={HOVER_CARD_OPEN_DELAY}
				closeDelay={HOVER_CARD_CLOSE_DELAY}
			>
				<ContextMenu>
					<HoverCardTrigger asChild>
						<ContextMenuTrigger asChild>{collapsedButton}</ContextMenuTrigger>
					</HoverCardTrigger>
					<ContextMenuContent>
						<ContextMenuItem onSelect={onCopyPath}>
							<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Copy Path
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={() => onDeleteClick()}>
							<LuX className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Close Worktree
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
				<HoverCardContent side="right" align="start" className="w-72">
					<WorkspaceHoverCardContent workspaceId={id} workspaceAlias={name} />
				</HoverCardContent>
			</HoverCard>
			<DeleteWorkspaceDialog
				workspaceId={id}
				workspaceName={name}
				workspaceType={type}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
			/>
		</>
	);
}
