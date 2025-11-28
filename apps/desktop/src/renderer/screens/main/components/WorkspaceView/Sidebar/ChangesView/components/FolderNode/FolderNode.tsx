import { HiChevronRight, HiFolderOpen } from "react-icons/hi2";
import type { FolderNodeProps } from "../../types";

export function FolderNode({
	node,
	depth,
	isExpanded,
	onToggle,
	children,
}: FolderNodeProps) {
	return (
		<div className="w-full">
			<button
				type="button"
				onClick={onToggle}
				className="w-full text-start group px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1 text-sm hover:bg-accent hover:text-accent-foreground"
				style={{ paddingLeft: `${depth * 12 + 12}px` }}
			>
				<HiChevronRight
					className={`size-4 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
				/>
				<HiFolderOpen className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{node.name}</span>
			</button>
			{isExpanded && <div className="mt-0.5">{children}</div>}
		</div>
	);
}
