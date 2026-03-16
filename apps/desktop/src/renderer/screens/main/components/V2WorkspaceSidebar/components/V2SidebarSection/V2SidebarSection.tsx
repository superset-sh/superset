import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuFolderOpen, LuPencil, LuTrash2 } from "react-icons/lu";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { V2SidebarSection as V2SidebarSectionRecord } from "../../types";
import { V2WorkspaceListItem } from "../V2WorkspaceListItem";

interface V2SidebarSectionProps {
	projectId: string;
	section: V2SidebarSectionRecord;
	shortcutBaseIndex: number;
	allSections: Array<{ id: string; name: string }>;
	onDelete: (sectionId: string) => void;
	onRename: (sectionId: string, name: string) => void;
	onToggleCollapse: (sectionId: string) => void;
}

export function V2SidebarSection({
	projectId,
	section,
	shortcutBaseIndex,
	allSections,
	onDelete,
	onRename,
	onToggleCollapse,
}: V2SidebarSectionProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);

	const workspaceIds = section.workspaces.map((workspace) => workspace.id);

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed) {
			onRename(section.id, trimmed);
		}
		setIsRenaming(false);
	};

	const handleCancelRename = () => {
		setRenameValue(section.name);
		setIsRenaming(false);
	};

	return (
		<div className="pb-1">
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={cn(
							"flex items-center w-full pl-2 pr-2 py-2 text-[11px] font-medium uppercase tracking-wider",
							"text-muted-foreground hover:bg-muted/50 transition-colors",
						)}
					>
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={handleSubmitRename}
								onCancel={handleCancelRename}
								className="h-5 px-1 py-0 text-[11px] tracking-wider font-medium bg-transparent border-none outline-none w-full text-muted-foreground"
							/>
						) : (
							<button
								type="button"
								onClick={() => onToggleCollapse(section.id)}
								onDoubleClick={() => {
									setRenameValue(section.name);
									setIsRenaming(true);
								}}
								className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
							>
								<HiChevronRight
									className={cn(
										"size-3 shrink-0 transition-transform duration-150",
										!section.isCollapsed && "rotate-90",
									)}
								/>
								<span className="truncate">{section.name}</span>
								<span className="text-[10px] tabular-nums font-normal">
									({section.workspaces.length})
								</span>
							</button>
						)}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={() => setIsRenaming(true)}>
						<LuPencil className="size-4 mr-2" />
						Rename Section
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => onToggleCollapse(section.id)}>
						<LuFolderOpen className="size-4 mr-2" />
						{section.isCollapsed ? "Expand Section" : "Collapse Section"}
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => onDelete(section.id)}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						Delete Section
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AnimatePresence initial={false}>
				{!section.isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pb-1">
							{section.workspaces.map((workspace, index) => (
								<V2WorkspaceListItem
									key={workspace.id}
									id={workspace.id}
									projectId={projectId}
									sectionId={section.id}
									name={workspace.name}
									branch={workspace.branch}
									index={index}
									workspaceIds={workspaceIds}
									sections={allSections}
									shortcutIndex={shortcutBaseIndex + index}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
