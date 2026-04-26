import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuGripVertical } from "react-icons/lu";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarSection } from "../../../../types";

interface DashboardSidebarSectionHeaderProps
	extends ComponentPropsWithoutRef<"div"> {
	section: DashboardSidebarSection;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	onToggleCollapse: () => void;
	actions?: ReactNode;
}

export const DashboardSidebarSectionHeader = forwardRef<
	HTMLDivElement,
	DashboardSidebarSectionHeaderProps
>(
	(
		{
			section,
			isRenaming,
			renameValue,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			onToggleCollapse,
			actions,
			className,
			...props
		},
		ref,
	) => {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: The header acts as a single toggle target in view mode while preserving nested inline controls.
			<div
				ref={ref}
				role={isRenaming ? undefined : "button"}
				tabIndex={isRenaming ? undefined : 0}
				onClick={isRenaming ? undefined : onToggleCollapse}
				onKeyDown={
					isRenaming
						? undefined
						: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggleCollapse();
								}
							}
				}
				className={cn(
					"group flex min-h-8 w-full items-center pl-0.5 pr-2 py-1.5 text-[13px] font-medium",
					"text-muted-foreground hover:bg-muted/50 transition-colors",
					className,
				)}
				{...props}
			>
				<div className="grid h-5 w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing [&>*]:col-start-1 [&>*]:row-start-1">
					<HiChevronRight
						className={cn(
							"size-3 text-muted-foreground transition-[opacity,transform] duration-150 group-hover:opacity-0",
							!section.isCollapsed && "rotate-90",
						)}
					/>
					<LuGripVertical className="size-3 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
				</div>

				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					{isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={onRenameValueChange}
							onSubmit={onSubmitRename}
							onCancel={onCancelRename}
							className="-ml-1 h-5 w-full min-w-0 px-1 py-0 text-[13px] font-medium bg-transparent border-none outline-none text-muted-foreground"
						/>
					) : (
						<span className="truncate">{section.name}</span>
					)}

					{!isRenaming && (
						<span className="shrink-0 text-[10px] font-normal tabular-nums">
							({section.workspaces.length})
						</span>
					)}
				</div>

				{!isRenaming && actions ? (
					// biome-ignore lint/a11y/noStaticElementInteractions: Nested action controls handle their own semantics; this wrapper only isolates events from the header toggle.
					<div
						className="flex items-center"
						onClick={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						{actions}
					</div>
				) : null}
			</div>
		);
	},
);
