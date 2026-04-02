import { useCallback, useMemo, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import type {
	Pane as PaneType,
	SplitPosition,
	Tab,
} from "../../../../../../../types";
import type {
	PaneActionConfig,
	PaneRegistry,
	RendererContext,
} from "../../../../../../types";
import { PaneHeaderActions } from "../../../../../PaneHeaderActions";
import { DropZoneOverlay } from "./components/DropZoneOverlay";
import { PaneContent } from "./components/PaneContent";
import { PANE_DRAG_TYPE, PaneHeader } from "./components/PaneHeader";

interface PaneComponentProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	tab: Tab<TData>;
	pane: PaneType<TData>;
	isActive: boolean;
	registry: PaneRegistry<TData>;
	parentDirection?: "horizontal" | "vertical" | null;
	paneActions?:
		| PaneActionConfig<TData>[]
		| ((context: RendererContext<TData>) => PaneActionConfig<TData>[]);
}

function resolveActions<TData>(
	config:
		| PaneActionConfig<TData>[]
		| ((
				context: RendererContext<TData>,
				defaults: PaneActionConfig<TData>[],
		  ) => PaneActionConfig<TData>[])
		| undefined,
	context: RendererContext<TData>,
	defaults: PaneActionConfig<TData>[],
): PaneActionConfig<TData>[] {
	if (!config) return defaults;
	if (typeof config === "function") return config(context, defaults);
	return config;
}

function getDropPosition(
	clientX: number,
	clientY: number,
	rect: DOMRect,
): SplitPosition {
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	const dx = clientX - cx;
	const dy = clientY - cy;
	if (Math.abs(dx) > Math.abs(dy)) {
		return dx > 0 ? "right" : "left";
	}
	return dy > 0 ? "bottom" : "top";
}

export function Pane<TData>({
	store,
	tab,
	pane,
	isActive,
	registry,
	parentDirection = null,
	paneActions,
}: PaneComponentProps<TData>) {
	const definition = registry[pane.kind];

	const tabs = store.getState().tabs;
	const tabPosition = tabs.findIndex((t) => t.id === tab.id);

	const context: RendererContext<TData> = useMemo(() => {
		const ctx: RendererContext<TData> = {
			pane: { ...pane, parentDirection },
			tab: { ...tab, position: tabPosition },
			isActive,
			store,
			actions: {
				close: () =>
					store.getState().closePane({ tabId: tab.id, paneId: pane.id }),
				focus: () =>
					store.getState().setActivePane({ tabId: tab.id, paneId: pane.id }),
				setTitle: (title: string) =>
					store.getState().setPaneTitleOverride({
						tabId: tab.id,
						paneId: pane.id,
						titleOverride: title,
					}),
				pin: () =>
					store.getState().setPanePinned({
						tabId: tab.id,
						paneId: pane.id,
						pinned: true,
					}),
				updateData: (data: TData) =>
					store.getState().setPaneData({ paneId: pane.id, data }),
				split: (position, newPane) =>
					store.getState().splitPane({
						tabId: tab.id,
						paneId: pane.id,
						position: position === "down" ? "bottom" : "right",
						newPane,
					}),
			},
			components: { PaneHeaderActions: () => null },
		};

		// Resolve workspace-level actions (or empty if not provided)
		const workspaceResolved =
			typeof paneActions === "function"
				? paneActions(ctx)
				: (paneActions ?? []);

		// Definition can override or modify workspace actions
		const finalActions = resolveActions(
			definition?.paneActions,
			ctx,
			workspaceResolved,
		);

		ctx.components.PaneHeaderActions = () => (
			<PaneHeaderActions actions={finalActions} context={ctx} />
		);

		return ctx;
	}, [
		pane,
		tab,
		isActive,
		store,
		definition,
		paneActions,
		parentDirection,
		tabPosition,
	]);

	const dropPositionRef = useRef<SplitPosition | null>(null);
	const [dropPosition, setDropPosition] = useState<SplitPosition | null>(null);
	const dropRef = useRef<HTMLDivElement>(null);

	const [{ isOver, canDrop }, connectDrop] = useDrop(
		() => ({
			accept: PANE_DRAG_TYPE,
			canDrop: (item: { paneId: string }) => item.paneId !== pane.id,
			hover: (_item, monitor) => {
				const offset = monitor.getClientOffset();
				const el = dropRef.current;
				if (!offset || !el) return;
				const rect = el.getBoundingClientRect();
				const pos = getDropPosition(offset.x, offset.y, rect);
				if (pos !== dropPositionRef.current) {
					dropPositionRef.current = pos;
					setDropPosition(pos);
				}
			},
			drop: (item: { paneId: string }) => {
				const pos = dropPositionRef.current;
				if (!pos) return;
				store.getState().movePaneToSplit({
					sourcePaneId: item.paneId,
					targetPaneId: pane.id,
					position: pos,
				});
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[pane.id, tab.id, store],
	);

	// Merge refs: connectDrop needs a node, and we need dropRef for rect calculations
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			(dropRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			connectDrop(node);
		},
		[connectDrop],
	);

	// Clear drop position when not hovering
	if (!isOver && dropPositionRef.current !== null) {
		dropPositionRef.current = null;
		if (dropPosition !== null) setDropPosition(null);
	}

	const title = definition
		? (pane.titleOverride ?? definition.getTitle?.(context) ?? pane.id)
		: `Unknown: ${pane.kind}`;
	const icon = definition?.getIcon?.(context);
	const titleContent = definition?.renderTitle?.(context);
	const headerExtras = definition?.renderHeaderExtras?.(context);
	const toolbar = definition?.renderToolbar?.(context);

	const isDropTarget = isOver && canDrop;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking anywhere in a pane focuses it (standard IDE behavior)
		<div
			ref={setRefs}
			className="relative flex h-full w-full flex-col overflow-hidden"
			onMouseDown={context.actions.focus}
		>
			<PaneHeader
				title={title}
				icon={icon}
				isActive={isActive}
				titleContent={titleContent}
				headerExtras={headerExtras}
				toolbar={toolbar}
				actionsContent={<context.components.PaneHeaderActions />}
				paneId={pane.id}
			/>
			<PaneContent>
				{definition ? (
					definition.renderPane(context)
				) : (
					<div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
						Unknown pane kind: {pane.kind}
					</div>
				)}
			</PaneContent>
			{isDropTarget && <DropZoneOverlay position={dropPosition} />}
		</div>
	);
}
