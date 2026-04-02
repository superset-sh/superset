import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { PencilIcon, XIcon } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import type { Tab } from "../../../../../../../types";
import { PANE_DRAG_TYPE } from "../../../Tab/components/Pane/components/PaneHeader";
import { TabRenameInput } from "./components/TabRenameInput";

export const TAB_DRAG_TYPE = "tab";

interface TabItemProps<TData> {
	tab: Tab<TData>;
	index: number;
	isActive: boolean;
	onSelect: () => void;
	onClose: () => void;
	onCloseOthers: () => void;
	onCloseAll: () => void;
	onRename: (title: string) => void;
	getTitle: (tab: Tab<TData>) => string;
	accessory?: ReactNode;
}

export function TabItem<TData>({
	tab,
	index,
	isActive,
	onSelect,
	onClose,
	onCloseOthers,
	onCloseAll,
	onRename,
	getTitle,
	accessory,
}: TabItemProps<TData>) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const title = getTitle(tab);

	const startEditing = () => {
		setEditValue(title);
		setIsEditing(true);
	};

	const stopEditing = () => {
		setIsEditing(false);
	};

	const saveEdit = () => {
		const nextTitle = editValue.trim();
		if (nextTitle.length > 0 && nextTitle !== title) {
			onRename(nextTitle);
		}
		stopEditing();
	};

	const nodeRef = useRef<HTMLDivElement>(null);

	const [{ isDragging }, connectDrag] = useDrag(
		() => ({
			type: TAB_DRAG_TYPE,
			item: { tabId: tab.id, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[tab.id, index],
	);

	// Existing pane-to-tab drop (hovering a pane over a tab switches to it)
	const [{ isOver: isPaneOver }, connectPaneDrop] = useDrop(
		() => ({
			accept: PANE_DRAG_TYPE,
			hover: () => {
				if (!isActive) onSelect();
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
			}),
		}),
		[isActive, onSelect],
	);

	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			(nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			connectDrag(node);
			connectPaneDrop(node);
		},
		[connectDrag, connectPaneDrop],
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: mousedown selects tab immediately before drag threshold */}
				<div
					ref={setRef}
					className={cn(
						"group relative flex h-full w-full items-center border-r border-border",
						isPaneOver && "bg-primary/5",
						isDragging && "opacity-30",
					)}
					onMouseDown={onSelect}
				>
					{isEditing ? (
						<div className="flex h-full w-full shrink-0 items-center px-2">
							<TabRenameInput
								className="text-sm w-full min-w-0 rounded border border-border bg-background px-1 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-ring"
								maxLength={64}
								onCancel={stopEditing}
								onChange={setEditValue}
								onSubmit={saveEdit}
								value={editValue}
							/>
						</div>
					) : (
						<>
							<Tooltip
								delayDuration={500}
								open={isDragging ? false : undefined}
							>
								<TooltipTrigger asChild>
									<button
										className={cn(
											"flex h-full w-full shrink-0 items-center gap-2 pl-3 pr-8 text-left text-sm transition-all",
											isActive
												? "bg-border/30 text-foreground"
												: "text-muted-foreground/70 hover:bg-tertiary/20 hover:text-muted-foreground",
										)}
										onAuxClick={(event) => {
											if (event.button === 1) {
												event.preventDefault();
												onClose();
											}
										}}
										onClick={onSelect}
										onDoubleClick={startEditing}
										type="button"
									>
										<span className="flex-1 truncate">{title}</span>
										{accessory}
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{title}
								</TooltipContent>
							</Tooltip>
							<div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
								<Tooltip delayDuration={500}>
									<TooltipTrigger asChild>
										<Button
											className="size-6 cursor-pointer hover:bg-muted"
											onClick={(event) => {
												event.stopPropagation();
												onClose();
											}}
											size="icon"
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
				<ContextMenuItem onSelect={startEditing}>
					<PencilIcon className="mr-2 size-4" />
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onClose}>
					<XIcon className="mr-2 size-4" />
					Close
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCloseOthers}>Close Others</ContextMenuItem>
				<ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
