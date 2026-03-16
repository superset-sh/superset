import { cn } from "@superset/ui/utils";
import { HiChevronRight } from "react-icons/hi2";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarSection } from "../../../../types";

interface DashboardSidebarSectionHeaderProps {
	section: DashboardSidebarSection;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	onStartRename: () => void;
	onToggleCollapse: () => void;
}

export function DashboardSidebarSectionHeader({
	section,
	isRenaming,
	renameValue,
	onRenameValueChange,
	onSubmitRename,
	onCancelRename,
	onStartRename,
	onToggleCollapse,
}: DashboardSidebarSectionHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-center w-full pl-2 pr-2 py-2 text-[11px] font-medium uppercase tracking-wider",
				"text-muted-foreground hover:bg-muted/50 transition-colors",
			)}
		>
			{isRenaming ? (
				<RenameInput
					value={renameValue}
					onChange={onRenameValueChange}
					onSubmit={onSubmitRename}
					onCancel={onCancelRename}
					className="h-5 px-1 py-0 text-[11px] tracking-wider font-medium bg-transparent border-none outline-none w-full text-muted-foreground"
				/>
			) : (
				<button
					type="button"
					onClick={onToggleCollapse}
					onDoubleClick={onStartRename}
					className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
				>
					<HiChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform duration-150",
							!section.isCollapsed && "rotate-90",
						)}
					/>
					<span className="truncate">{section.name}</span>
					<span className="text-[10px] tabular-nums font-normal">
						({section.workspaces.length})
					</span>
				</button>
			)}
		</div>
	);
}
