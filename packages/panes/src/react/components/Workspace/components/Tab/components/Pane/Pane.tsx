import { useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import type { Pane as PaneType, Tab } from "../../../../../../../types";
import type {
	PaneActionConfig,
	PaneRegistry,
	RendererContext,
} from "../../../../../../types";
import { PaneHeaderActions } from "../../../../../PaneHeaderActions";
import { PaneContent } from "./components/PaneContent";
import { PaneHeader } from "./components/PaneHeader";

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

	const title = definition
		? (pane.titleOverride ?? definition.getTitle?.(context) ?? pane.id)
		: `Unknown: ${pane.kind}`;
	const icon = definition?.getIcon?.(context);
	const titleContent = definition?.renderTitle?.(context);
	const headerExtras = definition?.renderHeaderExtras?.(context);
	const toolbar = definition?.renderToolbar?.(context);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking anywhere in a pane focuses it (standard IDE behavior)
		<div
			className="flex h-full w-full flex-col overflow-hidden border-[0.5px] border-border"
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
		</div>
	);
}
