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
import { useRef, useState } from "react";
import {
	LuArrowRightLeft,
	LuBellOff,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuMinus,
	LuPencil,
} from "react-icons/lu";
import {
	useCreateSectionFromWorkspaces,
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSection,
} from "renderer/react-query/workspaces";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { STROKE_WIDTH } from "../constants";
import { WorkspaceHoverCardContent } from "./components";
import { HOVER_CARD_CLOSE_DELAY, HOVER_CARD_OPEN_DELAY } from "./constants";

interface WorkspaceContextMenuProps {
	id: string;
	projectId: string;
	name: string;
	isBranchWorkspace: boolean;
	isUnread: boolean;
	workspaceStatus: string | null | undefined;
	sections: { id: string; name: string }[];
	onRename: () => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onSetUnread: (isUnread: boolean) => void;
	onResetStatus: () => void;
	children: React.ReactNode;
}

export function WorkspaceContextMenu({
	id,
	projectId,
	name,
	isBranchWorkspace,
	isUnread,
	workspaceStatus,
	sections,
	onRename,
	onOpenInFinder,
	onCopyPath,
	onSetUnread,
	onResetStatus,
	children,
}: WorkspaceContextMenuProps) {
	const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
	const contextMenuSelectionRef = useRef<string[]>([]);
	const selectionStore = useWorkspaceSelectionStore;
	const moveToSection = useMoveWorkspaceToSection();
	const bulkMoveToSection = useMoveWorkspacesToSection();
	const createSectionFromWorkspaces = useCreateSectionFromWorkspaces();

	const handleContextMenuOpenChange = (open: boolean) => {
		setIsContextMenuOpen(open);
		if (open) {
			const { selectedIds } = selectionStore.getState();
			contextMenuSelectionRef.current =
				selectedIds.has(id) && selectedIds.size > 1 ? [...selectedIds] : [];
		}
	};

	const handleMoveToSection = (targetSectionId: string | null) => {
		const captured = contextMenuSelectionRef.current;
		if (captured.length > 1) {
			bulkMoveToSection.mutate({
				workspaceIds: captured,
				sectionId: targetSectionId,
			});
			selectionStore.getState().clearSelection();
		} else {
			moveToSection.mutate({ workspaceId: id, sectionId: targetSectionId });
		}
	};

	const handleCreateSectionFromSelection = () => {
		const captured = contextMenuSelectionRef.current;
		const workspaceIds = captured.length > 1 ? captured : [id];

		createSectionFromWorkspaces.mutate({
			projectId,
			workspaceIds,
		});

		if (captured.length > 1) {
			selectionStore.getState().clearSelection();
		}
	};

	const unreadMenuItem = (
		<ContextMenuItem onSelect={() => onSetUnread(!isUnread)}>
			{isUnread ? (
				<>
					<LuEye className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Mark as Read
				</>
			) : (
				<>
					<LuEyeOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Mark as Unread
				</>
			)}
		</ContextMenuItem>
	);

	const commonContextMenuItems = (
		<>
			<ContextMenuItem onSelect={onOpenInFinder}>
				<LuFolderOpen className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				Open in Finder
			</ContextMenuItem>
			<ContextMenuItem onSelect={onCopyPath}>
				<LuCopy className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
				Copy Path
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<LuArrowRightLeft
						className="size-4 mr-2"
						strokeWidth={STROKE_WIDTH}
					/>
					Move to Section
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuItem onSelect={handleCreateSectionFromSelection}>
						<LuFolderPlus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						New Section
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={() => handleMoveToSection(null)}>
						<LuMinus className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Ungrouped
					</ContextMenuItem>
					{sections.length > 0 && <ContextMenuSeparator />}
					{sections.map((section) => (
						<ContextMenuItem
							key={section.id}
							onSelect={() => handleMoveToSection(section.id)}
						>
							{section.name}
						</ContextMenuItem>
					))}
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			{unreadMenuItem}
			{workspaceStatus && (
				<ContextMenuItem onSelect={onResetStatus}>
					<LuBellOff className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
					Clear Status
				</ContextMenuItem>
			)}
		</>
	);

	if (isBranchWorkspace) {
		return (
			<ContextMenu onOpenChange={handleContextMenuOpenChange}>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent>{commonContextMenuItems}</ContextMenuContent>
			</ContextMenu>
		);
	}

	return (
		<HoverCard
			open={isContextMenuOpen ? false : undefined}
			openDelay={HOVER_CARD_OPEN_DELAY}
			closeDelay={HOVER_CARD_CLOSE_DELAY}
		>
			<ContextMenu onOpenChange={handleContextMenuOpenChange}>
				<HoverCardTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</HoverCardTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={onRename}>
						<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Rename
					</ContextMenuItem>
					<ContextMenuSeparator />
					{commonContextMenuItems}
				</ContextMenuContent>
			</ContextMenu>
			<HoverCardContent side="right" align="start" className="w-72">
				<WorkspaceHoverCardContent workspaceId={id} workspaceAlias={name} />
			</HoverCardContent>
		</HoverCard>
	);
}
