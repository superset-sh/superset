import { X } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import { useTabsStore } from "renderer/stores/tabs";

const TAB_TYPE = "TAB";

interface TabItemProps {
	id: string;
	title: string;
	isActive: boolean;
	index: number;
}

function TabItem({ id, title, isActive, index }: TabItemProps) {
	const { setActiveTab, removeTab, reorderTabs } = useTabsStore();

	const [{ isDragging }, drag] = useDrag({
		type: TAB_TYPE,
		item: { id, index },
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	});

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
		<button
			type="button"
			ref={(node) => {
				drag(drop(node));
			}}
			onClick={() => setActiveTab(id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					setActiveTab(id);
				}
			}}
			tabIndex={0}
			className={`
				group relative flex items-center gap-2 px-4 h-full min-w-[120px] max-w-[240px] cursor-pointer
				${isActive ? "bg-background" : "bg-muted/50 hover:bg-muted"}
				${isDragging ? "opacity-50" : "opacity-100"}
				border-r border-border
			`}
		>
			<span className="flex-1 truncate text-sm text-foreground">{title}</span>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					removeTab(id);
				}}
				className="opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 rounded p-0.5 transition-opacity"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</button>
	);
}

export function Tabs() {
	const { tabs, activeTabId, addTab } = useTabsStore();

	return (
		<div className="flex items-center h-full w-full">
			<div className="relative flex-1 h-full overflow-hidden">
				<div className="flex items-center h-full overflow-x-auto hide-scrollbar">
					{tabs.map((tab, index) => (
						<TabItem
							key={tab.id}
							id={tab.id}
							title={tab.title}
							isActive={tab.id === activeTabId}
							index={index}
						/>
					))}
				</div>
				<div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-linear-to-l from-background to-transparent" />
			</div>
			<button
				type="button"
				onClick={addTab}
				className="shrink-0 px-3 h-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground border-l border-border"
			>
				<span className="text-lg">+</span>
			</button>
		</div>
	);
}
