import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useDrop } from "react-dnd";
import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuFolderPlus, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { RenameInput } from "../RenameInput";

const PROJECT_TYPE = "PROJECT";

interface ProjectGroupSectionProps {
	groupId: string;
	name: string;
	projectCount: number;
	workspaceCount: number;
	isCollapsed: boolean;
	isDefault?: boolean;
	onToggleCollapse: () => void;
	onRename: (name: string) => void;
	onDelete: () => void;
	onProjectDrop: (projectId: string) => void;
	onAddProject: (projectId: string) => void;
	availableProjects: Array<{ id: string; name: string }>;
	children: React.ReactNode;
}

export function ProjectGroupSection({
	groupId,
	name,
	projectCount,
	workspaceCount,
	isCollapsed,
	isDefault = false,
	onToggleCollapse,
	onRename,
	onDelete,
	onProjectDrop,
	onAddProject,
	availableProjects,
	children,
}: ProjectGroupSectionProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [renameValue, setRenameValue] = useState(name);

	const handleStartRename = () => {
		setRenameValue(name);
		setIsEditing(true);
	};

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== name) {
			onRename(trimmed);
		}
		setIsEditing(false);
	};

	const [{ isOver, canDrop }, drop] = useDrop(
		() => ({
			accept: PROJECT_TYPE,
			canDrop: (item: { projectId: string }) => Boolean(item.projectId),
			drop: (item: { projectId: string }) => {
				onProjectDrop(item.projectId);
				return { groupId };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver({ shallow: true }),
				canDrop: monitor.canDrop(),
			}),
		}),
		[groupId, onProjectDrop],
	);

	return (
		<div
			ref={(node) => {
				drop(node);
			}}
			className={cn(
				"border-b border-border/60 last:border-b-0 transition-colors",
				canDrop && "bg-primary/5",
				isOver && "bg-primary/10 ring-1 ring-inset ring-primary/30",
			)}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={cn(
							"flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-[0.16em] text-muted-foreground/90",
							"bg-muted/35 hover:bg-muted/50 transition-colors",
						)}
					>
						<button
							type="button"
							onClick={onToggleCollapse}
							onDoubleClick={handleStartRename}
							className="flex min-w-0 flex-1 items-center gap-2 text-left"
						>
							<HiChevronRight
								className={cn(
									"size-3.5 shrink-0 transition-transform",
									!isCollapsed && "rotate-90",
								)}
							/>
							{isEditing ? (
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={handleSubmitRename}
									onCancel={() => setIsEditing(false)}
									maxLength={48}
									className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-2 py-0 text-sm normal-case tracking-normal text-foreground"
								/>
							) : (
								<>
									<span className="truncate">{name}</span>
									<span className="text-[10px] tracking-normal lowercase text-muted-foreground/80">
										{projectCount} project{projectCount !== 1 ? "s" : ""} • {workspaceCount} workspace{workspaceCount !== 1 ? "s" : ""}
									</span>
								</>
							)}
						</button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6 shrink-0"
									onClick={(event) => event.stopPropagation()}
								>
									<LuPlus className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								{availableProjects.length === 0 ? (
									<DropdownMenuItem disabled>No projects available</DropdownMenuItem>
								) : (
									availableProjects.map((project) => (
										<DropdownMenuItem
											key={project.id}
											onClick={() => onAddProject(project.id)}
										>
											{project.name}
										</DropdownMenuItem>
									))
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={handleStartRename}>
						<LuPencil className="mr-2 size-4" />
						Rename Group
					</ContextMenuItem>
					{!isDefault && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem
								onSelect={onDelete}
								className="text-destructive focus:text-destructive"
							>
								<LuTrash2 className="mr-2 size-4 text-destructive" />
								Delete Group
							</ContextMenuItem>
						</>
					)}
				</ContextMenuContent>
			</ContextMenu>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
						className="overflow-hidden"
					>
						{projectCount === 0 ? (
							<div className="px-4 py-3 text-sm text-muted-foreground/80">
								<LuFolderPlus className="mb-1 size-4" />
								Drag a project here or use the project menu.
							</div>
						) : (
							children
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
