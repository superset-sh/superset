import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../core/store";
import type {
	PaneGroupNode,
	PaneRootState,
	PaneState,
} from "../../../../../types";
import type { PaneRegistry, PaneRendererContext } from "../../../../types";
import { PaneContent } from "../PaneContent";

interface PaneGroupProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	group: PaneGroupNode<TPaneData>;
	registry: PaneRegistry<TPaneData>;
	onAddPane?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
		root: PaneRootState<TPaneData>;
		group: PaneGroupNode<TPaneData>;
	}) => void;
	renderUnknownPane?: (
		context: PaneRendererContext<TPaneData>,
	) => React.ReactNode;
}

interface PaneGroupItemProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	group: PaneGroupNode<TPaneData>;
	pane: PaneState<TPaneData>;
	registry: PaneRegistry<TPaneData>;
	isActive: boolean;
}

function PaneGroupItem<TPaneData>({
	store,
	root,
	group,
	pane,
	registry,
	isActive,
}: PaneGroupItemProps<TPaneData>) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");

	const context: PaneRendererContext<TPaneData> = {
		store,
		root,
		group,
		pane,
		isActive,
	};
	const definition = registry[pane.kind];
	const title =
		pane.titleOverride ?? definition?.getTitle?.(context) ?? pane.id;

	const startEditing = () => {
		setEditValue(typeof title === "string" ? title : pane.id);
		setIsEditing(true);
	};

	const saveEdit = () => {
		const nextTitle = editValue.trim();
		store.getState().setPaneTitleOverride({
			rootId: root.id,
			groupId: group.id,
			paneId: pane.id,
			titleOverride: nextTitle.length > 0 ? nextTitle : undefined,
		});
		setIsEditing(false);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="group relative flex h-full shrink-0 border-r border-border">
					{isEditing ? (
						<div className="flex h-full w-[160px] items-center px-2">
							<Input
								autoFocus
								className="h-7"
								onBlur={saveEdit}
								onChange={(event) => setEditValue(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										saveEdit();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										setIsEditing(false);
									}
								}}
								value={editValue}
							/>
						</div>
					) : (
						<>
							<button
								className={cn(
									"flex h-full w-[160px] shrink-0 items-center gap-2 pl-3 pr-8 text-sm transition-all",
									isActive
										? "bg-border/30 text-foreground"
										: "text-muted-foreground/70 hover:bg-tertiary/20 hover:text-muted-foreground",
								)}
								onClick={() =>
									store.getState().setActivePane({
										rootId: root.id,
										groupId: group.id,
										paneId: pane.id,
									})
								}
								onDoubleClick={startEditing}
								type="button"
							>
								<span className="shrink-0">
									{definition?.getIcon?.(context) ?? null}
								</span>
								<span className="flex-1 truncate text-left">{title}</span>
								{pane.pinned ? (
									<span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
										PIN
									</span>
								) : null}
								<span className="shrink-0">
									{definition?.renderTabAccessory?.(context) ?? null}
								</span>
							</button>
							<div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
								<Tooltip delayDuration={500}>
									<TooltipTrigger asChild>
										<Button
											className="size-6 cursor-pointer hover:bg-muted"
											onClick={(event) => {
												event.stopPropagation();
												store.getState().closePane({
													rootId: root.id,
													groupId: group.id,
													paneId: pane.id,
												});
											}}
											size="icon-xs"
											type="button"
											variant="ghost"
										>
											<XIcon className="size-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" showArrow={false}>
										Close
									</TooltipContent>
								</Tooltip>
							</div>
						</>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={startEditing}>Rename</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={() =>
						store.getState().setPanePinned({
							rootId: root.id,
							groupId: group.id,
							paneId: pane.id,
							pinned: !pane.pinned,
						})
					}
				>
					{pane.pinned ? "Unpin" : "Pin"}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={() =>
						store.getState().closePane({
							rootId: root.id,
							groupId: group.id,
							paneId: pane.id,
						})
					}
				>
					Close
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

export function PaneGroup<TPaneData>({
	store,
	root,
	group,
	registry,
	onAddPane,
	renderUnknownPane,
}: PaneGroupProps<TPaneData>) {
	const activePane =
		group.panes.find((pane) => pane.id === group.activePaneId) ??
		group.panes[0] ??
		null;

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<div className="flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background">
				<div
					className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
					style={{ scrollbarWidth: "none" }}
				>
					<div className="flex h-full items-stretch">
						{group.panes.map((pane) => (
							<PaneGroupItem
								group={group}
								isActive={pane.id === activePane?.id}
								key={pane.id}
								pane={pane}
								registry={registry}
								root={root}
								store={store}
							/>
						))}
					</div>
				</div>
				{onAddPane ? (
					<div className="shrink-0 border-l border-border">
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<Button
									className="h-full rounded-none border-0 px-3 shadow-none"
									onClick={() => onAddPane({ store, root, group })}
									size="sm"
									type="button"
									variant="ghost"
								>
									<PlusIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" showArrow={false}>
								Add pane
							</TooltipContent>
						</Tooltip>
					</div>
				) : null}
			</div>
			<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
				{activePane ? (
					<PaneContent
						group={group}
						pane={activePane}
						registry={registry}
						renderUnknownPane={renderUnknownPane}
						root={root}
						store={store}
					/>
				) : (
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
						No panes in this group
					</div>
				)}
			</div>
		</div>
	);
}
