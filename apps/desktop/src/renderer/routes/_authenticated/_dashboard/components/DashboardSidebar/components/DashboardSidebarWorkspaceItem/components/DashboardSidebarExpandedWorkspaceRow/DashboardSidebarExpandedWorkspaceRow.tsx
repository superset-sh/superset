import { cn } from "@superset/ui/utils";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";

interface DashboardSidebarExpandedWorkspaceRowProps {
	name: string;
	branch: string;
	isActive: boolean;
	isDragging: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	onClick: () => void;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	setDragHandle: (node: HTMLButtonElement | null) => void;
}

export function DashboardSidebarExpandedWorkspaceRow({
	name,
	branch,
	isActive,
	isDragging,
	isRenaming,
	renameValue,
	shortcutLabel,
	onClick,
	onRenameValueChange,
	onSubmitRename,
	onCancelRename,
	setDragHandle,
}: DashboardSidebarExpandedWorkspaceRowProps) {
	const showBranch = !!name && name !== branch;

	return (
		<button
			type="button"
			ref={setDragHandle}
			onClick={onClick}
			className={cn(
				"flex w-full pl-3 pr-2 text-sm text-left cursor-pointer relative",
				"hover:bg-muted/50 transition-colors group",
				showBranch ? "py-1.5" : "py-2 items-center",
				isActive && "bg-muted",
				isDragging && "opacity-30",
			)}
		>
			{isActive && (
				<div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />
			)}

			<div className="flex-1 min-w-0">
				{isRenaming ? (
					<RenameInput
						value={renameValue}
						onChange={onRenameValueChange}
						onSubmit={onSubmitRename}
						onCancel={onCancelRename}
						className="h-6 px-1 py-0 text-[13px] -ml-1 bg-transparent border-none outline-none w-full"
					/>
				) : (
					<>
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors flex-1",
									isActive
										? "text-foreground font-medium"
										: "text-foreground/80",
								)}
							>
								{name || branch}
							</span>

							{shortcutLabel && (
								<span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
									{shortcutLabel}
								</span>
							)}
						</div>

						{showBranch && (
							<span className="text-[11px] text-muted-foreground/60 truncate font-mono leading-tight block">
								{branch}
							</span>
						)}
					</>
				)}
			</div>
		</button>
	);
}
