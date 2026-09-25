import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";
import { HiChevronRight } from "react-icons/hi2";
import type { DashboardSidebarWorkspaceIndentation } from "../../types";

interface DashboardSidebarGroupHeaderProps
	extends ComponentPropsWithoutRef<"div"> {
	label: ReactNode;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	actions?: ReactNode;
	isEditing?: boolean;
	isDraggable?: boolean;
	/**
	 * Column the header's chevron sits in: the same one the lane's ungrouped
	 * rows use, so a folder reads as a sibling of the rows around it.
	 */
	indentation?: Exclude<DashboardSidebarWorkspaceIndentation, "grouped">;
}

/** Shared visual and interaction shell for every nested sidebar group. */
export const DashboardSidebarGroupHeader = forwardRef<
	HTMLDivElement,
	DashboardSidebarGroupHeaderProps
>(
	(
		{
			label,
			isCollapsed,
			onToggleCollapse,
			actions,
			isEditing = false,
			isDraggable = false,
			indentation = "workspace",
			className,
			...props
		},
		ref,
	) => (
		// biome-ignore lint/a11y/noStaticElementInteractions: The header acts as a single toggle target while preserving nested inline controls in edit mode.
		<div
			ref={ref}
			role={isEditing ? undefined : "button"}
			tabIndex={isEditing ? undefined : 0}
			onClick={isEditing ? undefined : onToggleCollapse}
			onKeyDown={
				isEditing
					? undefined
					: (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onToggleCollapse();
							}
						}
			}
			className={cn(
				// Group containers have a 2px left accent border. Use a 6px left
				// margin so their content aligns with borderless top-level rows.
				"group ml-1.5 mr-2 flex min-h-7 items-center rounded-md py-1 pr-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover",
				// Mirrors DashboardSidebarExpandedWorkspaceRow's per-lane padding.
				indentation === "top-level" ? "pl-2" : "pl-6",
				className,
			)}
			{...props}
		>
			<div
				className={cn(
					"mr-1 grid h-5 w-5 shrink-0 place-items-center",
					isDraggable && "cursor-grab active:cursor-grabbing",
				)}
			>
				<HiChevronRight
					className={cn(
						"size-3 text-muted-foreground transition-transform duration-150",
						!isCollapsed && "rotate-90",
					)}
				/>
			</div>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">{label}</div>
			{!isEditing && (
				<div className="ml-1 flex size-5 shrink-0 items-center justify-center">
					{actions ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: Nested action controls own their semantics; this wrapper isolates them from the header toggle.
						<div
							className="hidden size-full items-center justify-center group-hover:flex group-has-[:focus]:flex has-[[data-state=open]]:flex"
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
						>
							{actions}
						</div>
					) : null}
				</div>
			)}
		</div>
	),
);
