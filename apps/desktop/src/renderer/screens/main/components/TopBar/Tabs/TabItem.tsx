import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { useTabsStore } from "renderer/stores/tabs";

const TAB_TYPE = "TAB";

interface TabItemProps {
	id: string;
	title: string;
	isActive: boolean;
	index: number;
	width: number;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export function TabItem({
	id,
	title,
	isActive,
	index,
	width,
	onMouseEnter,
	onMouseLeave,
}: TabItemProps) {
	const { setActiveTab, removeTab, reorderTabs } = useTabsStore();

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: TAB_TYPE,
			item: { id, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id, index],
	);

	const [, drop] = useDrop({
		accept: TAB_TYPE,
		hover: (item: { id: string; index: number }) => {
			if (item.index !== index) {
				reorderTabs(item.index, index);
				item.index = index;
			}
		},
	});

	return (
		<div
			className="group relative flex items-end shrink-0 h-full"
			style={{ width: `${width}px` }}
		>
			{/* Active tab bottom border overlay */}
			{isActive && <div className="absolute bottom-0 left-0 right-0 h-px" />}

			{/* Main tab button */}
			<button
				type="button"
				ref={(node) => {
					drag(drop(node));
				}}
				onClick={() => setActiveTab(id)}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
				className={`
					flex items-center gap-0.5 rounded-t-md transition-all w-full shrink-0 pr-6 pl-3 h-[80%]
					${
						isActive
							? "text-foreground bg-sidebar"
							: "text-muted-foreground hover:text-foreground hover:bg-muted/30"
					}
					${isDragging ? "opacity-30" : "opacity-100"}
				`}
				style={{ cursor: isDragging ? "grabbing" : "grab" }}
			>
				<span className="text-sm whitespace-nowrap truncate flex-1 text-left">
					{title}
				</span>
			</button>

			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={(e) => {
					e.stopPropagation();
					removeTab(id);
				}}
				className={cn(
					"mt-1 absolute right-1 top-1/2 -translate-y-1/2 size-5 ",
					isActive ? "opacity-90" : "opacity-0 group-hover:opacity-90",
				)}
				aria-label="Close tab"
			>
				<HiMiniXMark className="size-4" />
			</Button>
		</div>
	);
}
