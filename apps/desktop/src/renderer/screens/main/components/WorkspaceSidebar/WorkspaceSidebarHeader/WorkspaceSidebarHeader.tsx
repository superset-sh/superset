import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useState } from "react";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
	LuLayers,
	LuMessageSquare,
	LuPanelLeft,
	LuPanelLeftClose,
	LuPanelLeftOpen,
} from "react-icons/lu";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { STROKE_WIDTH, STROKE_WIDTH_THIN } from "../constants";
import { NewWorkspaceButton } from "./NewWorkspaceButton";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { toggleCollapsed } = useWorkspaceSidebarStore();
	const [isHovering, setIsHovering] = useState(false);
	const hasTasksAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.ELECTRIC_TASKS_ACCESS,
	);

	// Derive active state from route
	const isWorkspacesListOpen = !!matchRoute({ to: "/workspaces" });
	const isTasksOpen = !!matchRoute({ to: "/tasks" });
	const isChatOpen = !!matchRoute({ to: "/chat" });

	const handleWorkspacesClick = () => {
		if (isWorkspacesListOpen) {
			// Navigate back to workspace view
			navigate({ to: "/workspace" });
		} else {
			navigate({ to: "/workspaces" });
		}
	};

	const handleTasksClick = () => {
		navigate({ to: "/tasks" });
	};

	const handleChatClick = () => {
		navigate({ to: "/chat" });
	};

	const handleToggleSidebar = () => {
		toggleCollapsed();
	};

	const getToggleIcon = () => {
		if (isCollapsed) {
			return isHovering ? (
				<LuPanelLeftOpen className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
			) : (
				<LuPanelLeft className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
			);
		}
		return isHovering ? (
			<LuPanelLeftClose className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
		) : (
			<LuPanelLeft className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
		);
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2 gap-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleToggleSidebar}
							onMouseEnter={() => setIsHovering(true)}
							onMouseLeave={() => setIsHovering(false)}
							className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
						>
							{getToggleIcon()}
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Toggle sidebar</TooltipContent>
				</Tooltip>

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleWorkspacesClick}
							className={cn(
								"flex items-center justify-center size-8 rounded-md transition-colors",
								isWorkspacesListOpen
									? "text-foreground bg-accent"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>

				{hasTasksAccess && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleTasksClick}
								className={cn(
									"flex items-center justify-center size-8 rounded-md transition-colors",
									isTasksOpen
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
							>
								<HiOutlineClipboardDocumentList
									className="size-4"
									strokeWidth={STROKE_WIDTH}
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">Tasks</TooltipContent>
					</Tooltip>
				)}

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleChatClick}
							className={cn(
								"flex items-center justify-center size-8 rounded-md transition-colors",
								isChatOpen
									? "text-foreground bg-accent"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							<LuMessageSquare className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Chat</TooltipContent>
				</Tooltip>

				<NewWorkspaceButton isCollapsed />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 pt-2 pb-2">
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleToggleSidebar}
						onMouseEnter={() => setIsHovering(true)}
						onMouseLeave={() => setIsHovering(false)}
						className="flex items-center gap-2 px-2 py-1.5 w-full rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<div className="flex items-center justify-center size-5">
							{getToggleIcon()}
						</div>
						{isHovering && (
							<span className="text-sm font-medium flex-1 text-left">
								Toggle sidebar
							</span>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">Toggle sidebar</TooltipContent>
			</Tooltip>

			<button
				type="button"
				onClick={handleWorkspacesClick}
				className={cn(
					"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
					isWorkspacesListOpen
						? "text-foreground bg-accent"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
				)}
			>
				<div className="flex items-center justify-center size-5">
					<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="text-sm font-medium flex-1 text-left">Workspaces</span>
			</button>

			{hasTasksAccess && (
				<button
					type="button"
					onClick={handleTasksClick}
					className={cn(
						"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
						isTasksOpen
							? "text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					)}
				>
					<div className="flex items-center justify-center size-5">
						<HiOutlineClipboardDocumentList
							className="size-4"
							strokeWidth={STROKE_WIDTH}
						/>
					</div>
					<span className="text-sm font-medium flex-1 text-left">Tasks</span>
				</button>
			)}

			<button
				type="button"
				onClick={handleChatClick}
				className={cn(
					"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
					isChatOpen
						? "text-foreground bg-accent"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
				)}
			>
				<div className="flex items-center justify-center size-5">
					<LuMessageSquare className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="text-sm font-medium flex-1 text-left">Chat</span>
			</button>

			<NewWorkspaceButton />
		</div>
	);
}
