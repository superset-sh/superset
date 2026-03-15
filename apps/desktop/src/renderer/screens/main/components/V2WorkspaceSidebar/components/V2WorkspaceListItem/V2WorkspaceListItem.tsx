import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { useV2WorkspaceDnD } from "../../hooks/useV2WorkspaceDnD";
import { V2DeleteDialog } from "../V2DeleteDialog";
import { V2WorkspaceContextMenu } from "./V2WorkspaceContextMenu";

const MAX_KEYBOARD_SHORTCUT_INDEX = 9;

interface V2WorkspaceListItemProps {
	id: string;
	projectId: string;
	name: string;
	branch: string;
	index: number;
	workspaceIds: string[];
	shortcutIndex?: number;
	isCollapsed?: boolean;
}

export function V2WorkspaceListItem({
	id,
	projectId,
	name,
	branch,
	index,
	workspaceIds,
	shortcutIndex,
	isCollapsed = false,
}: V2WorkspaceListItemProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(name);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { isDragging, drag, drop } = useV2WorkspaceDnD({
		workspaceId: id,
		projectId,
		index,
		workspaceIds,
	});

	const isActive = !!matchRoute({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId: id },
		fuzzy: true,
	});

	const showBranch = !!name && name !== branch;

	const handleClick = () => {
		if (isRenaming) return;
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: id },
		});
	};

	const startRename = () => {
		setRenameValue(name);
		setIsRenaming(true);
	};

	const submitRename = async () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === name) return;
		try {
			await apiTrpcClient.v2Workspace.update.mutate({
				id,
				name: trimmed,
			});
		} catch (error) {
			toast.error(
				`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(name);
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await apiTrpcClient.v2Workspace.delete.mutate({ id });
			setIsDeleteDialogOpen(false);
			toast.success("Workspace deleted");
			if (isActive) {
				navigate({ to: "/" });
			}
		} catch (error) {
			toast.error(
				`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	if (isCollapsed) {
		return (
			<>
				<V2WorkspaceContextMenu
					id={id}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
				>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								ref={(node) => {
									drag(drop(node));
								}}
								onClick={handleClick}
								className={cn(
									"relative flex items-center justify-center size-8 rounded-md",
									"hover:bg-muted/50 transition-colors cursor-pointer",
									isActive && "bg-muted",
									isDragging && "opacity-30",
								)}
							>
								<GoGitBranch
									className={cn(
										"size-4",
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								/>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right" className="flex flex-col gap-0.5">
							<span className="font-medium">{name || branch}</span>
							{showBranch && (
								<span className="text-xs text-muted-foreground font-mono">
									{branch}
								</span>
							)}
						</TooltipContent>
					</Tooltip>
				</V2WorkspaceContextMenu>

				<V2DeleteDialog
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onConfirm={handleDelete}
					title={`Delete "${name || branch}"?`}
					description="This will permanently delete the workspace."
					isPending={isDeleting}
				/>
			</>
		);
	}

	return (
		<>
			<V2WorkspaceContextMenu
				id={id}
				onRename={startRename}
				onDelete={() => setIsDeleteDialogOpen(true)}
			>
				<button
					type="button"
					ref={(node) => {
						drag(drop(node));
					}}
					onClick={handleClick}
					className={cn(
						"flex w-full pl-3 pr-2 text-sm text-left cursor-pointer relative",
						"hover:bg-muted/50 transition-colors",
						"group",
						showBranch ? "py-1.5" : "py-2 items-center",
						isActive && "bg-muted",
						isDragging && "opacity-30",
					)}
				>
					{isActive && (
						<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
					)}

					<div className="flex-1 min-w-0">
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={submitRename}
								onCancel={cancelRename}
								className="h-6 px-1 py-0 text-[13px] -ml-1 bg-transparent border-none outline-none w-full"
							/>
						) : (
							<>
								<div className="flex items-center gap-1.5">
									<span
										className={cn(
											"truncate text-[13px] leading-tight transition-colors flex-1",
											isActive
												? "text-foreground font-medium"
												: "text-foreground/80",
										)}
									>
										{name || branch}
									</span>

									{shortcutIndex !== undefined &&
										shortcutIndex < MAX_KEYBOARD_SHORTCUT_INDEX && (
											<span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
												⌘{shortcutIndex + 1}
											</span>
										)}
								</div>

								{showBranch && (
									<span className="text-[11px] text-muted-foreground/60 truncate font-mono leading-tight block">
										{branch}
									</span>
								)}
							</>
						)}
					</div>
				</button>
			</V2WorkspaceContextMenu>

			<V2DeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDelete}
				title={`Delete "${name || branch}"?`}
				description="This will permanently delete the workspace."
				isPending={isDeleting}
			/>
		</>
	);
}
