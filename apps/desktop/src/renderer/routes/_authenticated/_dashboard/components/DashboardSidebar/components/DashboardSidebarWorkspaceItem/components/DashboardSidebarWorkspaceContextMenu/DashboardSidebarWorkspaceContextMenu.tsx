import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import {
	LuArrowRightLeft,
	LuCopy,
	LuFolderOpen,
	LuFolderPlus,
	LuMinus,
	LuPencil,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface DashboardSidebarWorkspaceContextMenuProps {
	hoverCardContent?: React.ReactNode;
	projectId: string;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	projectId,
	hoverCardContent,
	onCreateSection,
	onMoveToSection,
	onOpenInFinder,
	onCopyPath,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
	const collections = useCollections();
	const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.where(({ sidebarSections }) =>
					eq(sidebarSections.projectId, projectId),
				)
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					name: sidebarSections.name,
				})),
		[collections, projectId],
	);

	const menuContent = (
		<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
			<ContextMenuItem onSelect={onRename}>
				<LuPencil className="size-4 mr-2" />
				Rename
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={onOpenInFinder}>
				<LuFolderOpen className="size-4 mr-2" />
				Open in Finder
			</ContextMenuItem>
			<ContextMenuItem onSelect={onCopyPath}>
				<LuCopy className="size-4 mr-2" />
				Copy Path
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<LuArrowRightLeft className="size-4 mr-2" />
					Move to Section
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuItem onSelect={onCreateSection}>
						<LuFolderPlus className="size-4 mr-2" />
						New Section
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => onMoveToSection(null)}>
						<LuMinus className="size-4 mr-2" />
						Ungrouped
					</ContextMenuItem>
					{sections.map((section) => (
						<ContextMenuItem
							key={section.id}
							onSelect={() => onMoveToSection(section.id)}
						>
							{section.name}
						</ContextMenuItem>
					))}
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			<ContextMenuItem
				onSelect={onRemoveFromSidebar}
				className="text-destructive focus:text-destructive"
			>
				<LuX className="size-4 mr-2 text-destructive" />
				Remove from Sidebar
			</ContextMenuItem>
			<ContextMenuItem
				onSelect={onDelete}
				className="text-destructive focus:text-destructive"
			>
				<LuTrash2 className="size-4 mr-2 text-destructive" />
				Delete
			</ContextMenuItem>
		</ContextMenuContent>
	);

	if (!hoverCardContent) {
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				{menuContent}
			</ContextMenu>
		);
	}

	return (
		<HoverCard
			open={isContextMenuOpen ? false : undefined}
			openDelay={400}
			closeDelay={100}
		>
			<ContextMenu onOpenChange={setIsContextMenuOpen}>
				<HoverCardTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</HoverCardTrigger>
				{menuContent}
			</ContextMenu>
			<HoverCardContent side="right" align="start" className="w-72">
				{hoverCardContent}
			</HoverCardContent>
		</HoverCard>
	);
}
