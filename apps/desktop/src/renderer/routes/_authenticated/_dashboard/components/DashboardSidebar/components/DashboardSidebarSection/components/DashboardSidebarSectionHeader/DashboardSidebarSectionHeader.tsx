import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuGripVertical, LuPencil } from "react-icons/lu";
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
	onStartRename: () => void;
	onToggleCollapse: () => void;
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
			onStartRename,
			onToggleCollapse,
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
					"group flex min-h-8 w-full items-center pl-0.5 pr-2 py-1.5 text-[11px] font-medium",
					"text-muted-foreground hover:bg-muted/50 transition-colors",
					className,
				)}
				{...props}
			>
				<div className="flex shrink-0 items-center justify-center w-5 h-5 opacity-0 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing">
					<LuGripVertical className="size-3" />
				</div>

				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					{isRenaming ? (
						<RenameInput
							value={renameValue}
							onChange={onRenameValueChange}
							onSubmit={onSubmitRename}
							onCancel={onCancelRename}
							className="-ml-1 h-5 w-full min-w-0 px-1 py-0 text-[11px] font-medium bg-transparent border-none outline-none text-muted-foreground"
						/>
					) : (
						<span className="truncate">{section.name}</span>
					)}

					{!isRenaming && (
						<div className="grid shrink-0 items-center [&>*]:col-start-1 [&>*]:row-start-1">
							<span className="pointer-events-none text-[10px] font-normal tabular-nums transition-opacity duration-150 group-hover:opacity-0">
								({section.workspaces.length})
							</span>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onStartRename();
								}}
								className="z-10 flex items-center justify-center opacity-0 text-muted-foreground transition-[opacity,color] duration-150 group-hover:opacity-100 hover:text-foreground"
								aria-label="Rename section"
							>
								<LuPencil className="size-3.5" />
							</button>
						</div>
					)}
				</div>

				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onToggleCollapse();
					}}
					onContextMenu={(event) => event.stopPropagation()}
					aria-expanded={!section.isCollapsed}
					className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
				>
					<HiChevronRight
						className={cn(
							"size-3 text-muted-foreground transition-transform duration-150",
							!section.isCollapsed && "rotate-90",
						)}
					/>
				</button>
			</div>
		);
	},
);
