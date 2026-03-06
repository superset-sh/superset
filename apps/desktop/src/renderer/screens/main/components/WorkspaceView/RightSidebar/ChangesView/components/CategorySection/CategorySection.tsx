import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiChevronRight } from "react-icons/hi2";
import { LuGripVertical } from "react-icons/lu";
import type { ChangeCategory } from "shared/changes-types";

const CHANGES_SECTION_DND_TYPE = "CHANGES_SECTION";

interface ChangesSectionDragItem {
	draggedId: ChangeCategory;
	currentId: ChangeCategory;
}

interface CategorySectionProps {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	children: ReactNode;
	actions?: ReactNode;
	onMove?: (fromSection: ChangeCategory, toSection: ChangeCategory) => void;
}

export function CategorySection({
	id,
	title,
	count,
	isExpanded,
	onToggle,
	children,
	actions,
	onMove,
}: CategorySectionProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const handleRef = useRef<HTMLButtonElement>(null);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: CHANGES_SECTION_DND_TYPE,
			item: { draggedId: id, currentId: id },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id],
	);

	const [{ isOver }, drop] = useDrop(
		() => ({
			accept: CHANGES_SECTION_DND_TYPE,
			hover: (item: ChangesSectionDragItem) => {
				if (item.currentId === id) return;
				onMove?.(item.currentId, id);
				item.currentId = id;
			},
			collect: (monitor) => ({
				isOver: monitor.isOver({ shallow: true }),
			}),
		}),
		[id, onMove],
	);

	useEffect(() => {
		drop(containerRef);
	}, [drop]);

	useEffect(() => {
		drag(handleRef);
	}, [drag]);

	if (count === 0) {
		return null;
	}

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn(
				"min-w-0 overflow-hidden transition-opacity",
				isDragging && "opacity-45",
			)}
		>
			<div
				ref={containerRef}
				className={cn(
					"group flex items-center min-w-0",
					isOver && "bg-accent/20",
				)}
			>
				<button
					ref={handleRef}
					type="button"
					aria-label={`Reorder ${title} section`}
					className={cn(
						"ml-1 flex h-6 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors",
						"cursor-grab active:cursor-grabbing hover:text-foreground",
					)}
					onClick={(event) => event.preventDefault()}
				>
					<LuGripVertical className="size-3.5" />
				</button>
				<CollapsibleTrigger
					className={cn(
						"flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left min-w-0",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					<HiChevronRight
						className={cn(
							"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
					<span className="text-xs font-medium truncate">{title}</span>
					<span className="text-[10px] text-muted-foreground shrink-0">
						{count}
					</span>
				</CollapsibleTrigger>
				{actions && <div className="pr-1.5 shrink-0">{actions}</div>}
			</div>

			<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
