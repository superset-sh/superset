import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import type {
	ContextMenuActionConfig,
	RendererContext,
} from "../../../../../../../../types";

interface PaneContextMenuProps<TData> {
	children: ReactNode;
	actions: ContextMenuActionConfig<TData>[];
	context: RendererContext<TData>;
}

function ContextMenuItems<TData>({
	actions,
	context,
}: {
	actions: ContextMenuActionConfig<TData>[];
	context: RendererContext<TData>;
}) {
	return (
		<>
			{actions.map((action) => {
				if (action.type === "separator") {
					return <ContextMenuSeparator key={action.key} />;
				}

				if (action.children) {
					const childActions =
						typeof action.children === "function"
							? action.children(context)
							: action.children;

					return (
						<ContextMenuSub key={action.key}>
							<ContextMenuSubTrigger className="gap-2">
								{action.icon}
								{action.label}
							</ContextMenuSubTrigger>
							<ContextMenuSubContent>
								<ContextMenuItems actions={childActions} context={context} />
							</ContextMenuSubContent>
						</ContextMenuSub>
					);
				}

				const disabled =
					typeof action.disabled === "function"
						? action.disabled(context)
						: action.disabled;

				const shortcut = action.shortcut ?? action.hotkeyId;

				return (
					<ContextMenuItem
						key={action.key}
						disabled={disabled}
						variant={action.variant}
						onSelect={() => action.onSelect?.(context)}
					>
						{action.icon}
						{action.label}
						{shortcut && <ContextMenuShortcut>{shortcut}</ContextMenuShortcut>}
					</ContextMenuItem>
				);
			})}
		</>
	);
}

export function PaneContextMenu<TData>({
	children,
	actions,
	context,
}: PaneContextMenuProps<TData>) {
	if (actions.length === 0) {
		return <>{children}</>;
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItems actions={actions} context={context} />
			</ContextMenuContent>
		</ContextMenu>
	);
}
