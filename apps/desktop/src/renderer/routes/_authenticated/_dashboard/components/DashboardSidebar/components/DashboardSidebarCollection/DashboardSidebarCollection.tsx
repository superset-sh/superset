import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLingui } from "@lingui/react/macro";
import { mintFolderTag } from "@superset/shared/workspace-tags";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import type { ProjectCollection } from "renderer/routes/_authenticated/utils/projectCollections/projectCollections";
import { useRunAfterMenuClose } from "../../hooks/useRunAfterMenuClose";
import { collectionDropId } from "../../hooks/useSidebarDnd/projectCollectionDrop";
import { useSidebarProjectCollections } from "../../providers/DashboardSidebarProjectCollectionsProvider/DashboardSidebarProjectCollectionsProvider";
import { DashboardSidebarCollectionHeader } from "../DashboardSidebarCollectionHeader";
import { CollectionMenuItems } from "./components/CollectionMenuItems/CollectionMenuItems";

interface DashboardSidebarCollectionProps {
	collection: ProjectCollection<{ id: string }>;
	isDragDisabled: boolean;
	children: ReactNode;
}

export function DashboardSidebarCollection({
	collection,
	isDragDisabled,
	children,
}: DashboardSidebarCollectionProps) {
	const { t } = useLingui();
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const state = useSidebarProjectCollections();
	const editing = state?.editingTag === collection.tag;
	const [name, setName] = useState(collection.name);
	const input = useRef<HTMLInputElement>(null);
	const submitting = useRef(false);
	const {
		active,
		setNodeRef,
		attributes,
		listeners,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: collection.id,
		data: { type: "collection" },
		disabled: isDragDisabled || editing,
	});
	const isCollectionDragActive = active?.data.current?.type === "collection";
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: collectionDropId(collection.id),
		disabled: isDragDisabled,
	});
	useEffect(() => {
		if (editing) {
			setName(collection.name);
			input.current?.focus();
			input.current?.select();
		}
	}, [editing, collection.name]);
	const submit = async () => {
		if (submitting.current) return;
		submitting.current = true;
		try {
			if (name.trim() && name.trim() !== collection.name) {
				const saved = await state?.run({
					type: "rename",
					tag: collection.tag,
					name: name.trim(),
					...(state?.newCollectionTag === collection.tag
						? {
								replacementTag: mintFolderTag(
									name,
									state.collections
										.filter((row) => row.tag !== collection.tag)
										.map((row) => row.tag),
								),
							}
						: {}),
				});
				if (!saved) return;
			}
			state?.setNewCollectionTag(null);
			state?.setEditingTag(null);
		} finally {
			submitting.current = false;
		}
	};

	const menuProps = {
		canDelete: state?.canDeleteCollection(collection.tag) ?? false,
		color: collection.color,
		onRename: () => runAfterClose(() => state?.setEditingTag(collection.tag)),
		onColor: (color: string | null) => {
			void state?.run({ type: "color", tag: collection.tag, color });
		},
		onDelete: async () => {
			const saved = await state?.run({ type: "delete", tag: collection.tag });
			if (!saved) return;
			if (state?.editingTag === collection.tag) state.setEditingTag(null);
			if (state?.newCollectionTag === collection.tag)
				state.setNewCollectionTag(null);
		},
	};
	return (
		<div
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<DashboardSidebarCollectionHeader
						ref={setNodeRef}
						labelRef={setDropRef}
						color={collection.color}
						projectCount={collection.projects.length}
						isCollapsed={collection.isCollapsed}
						isEditing={editing}
						isDraggable={!isDragDisabled}
						onToggleCollapse={() => {
							void state?.run({
								type: "collapse",
								tag: collection.tag,
								isCollapsed: !collection.isCollapsed,
							});
						}}
						className={cn(
							isOver &&
								!isCollectionDragActive &&
								"bg-sidebar-primary/15 ring-1 ring-inset ring-sidebar-primary",
						)}
						{...(editing ? {} : attributes)}
						{...(editing ? {} : listeners)}
						{...(editing ? {} : { "aria-expanded": !collection.isCollapsed })}
						onKeyDown={
							editing
								? undefined
								: (event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											void state?.run({
												type: "collapse",
												tag: collection.tag,
												isCollapsed: !collection.isCollapsed,
											});
										}
									}
						}
						actions={
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										aria-label={t({ message: "Collection actions" })}
										className="size-5 rounded hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<HiEllipsisHorizontal className="size-4" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent onCloseAutoFocus={onCloseAutoFocus}>
									<CollectionMenuItems kind="dropdown" {...menuProps} />
								</DropdownMenuContent>
							</DropdownMenu>
						}
					>
						{editing ? (
							<input
								ref={input}
								aria-label={t({ message: "Collection name" })}
								className="min-w-0 w-full bg-transparent outline-none"
								value={name}
								maxLength={200}
								onChange={(event) => setName(event.target.value)}
								onBlur={() => {
									void submit();
								}}
								onKeyDown={(event) => {
									event.stopPropagation();
									if (event.key === "Enter") {
										event.preventDefault();
										void submit();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										state?.setNewCollectionTag(null);
										state?.setEditingTag(null);
									}
								}}
							/>
						) : (
							<span className="truncate" title={collection.name}>
								{collection.name}
							</span>
						)}
					</DashboardSidebarCollectionHeader>
				</ContextMenuTrigger>
				<ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
					<CollectionMenuItems kind="context" {...menuProps} />
				</ContextMenuContent>
			</ContextMenu>
			{!collection.isCollapsed && !isCollectionDragActive && (
				<div className="ml-3">{children}</div>
			)}
		</div>
	);
}
