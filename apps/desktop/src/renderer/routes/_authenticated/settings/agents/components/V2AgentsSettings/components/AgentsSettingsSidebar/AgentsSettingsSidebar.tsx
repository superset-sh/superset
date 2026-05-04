import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
	AgentPreset,
	HostAgentConfigDto,
} from "@superset/host-service/settings";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { LuGripVertical } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import {
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../../../components/SettingsListSidebar";

interface AgentsSettingsSidebarProps {
	configs: HostAgentConfigDto[];
	presets: AgentPreset[];
	selectedAgentId: string | null;
	onSelectAgent: (id: string) => void;
	onAddAgent: (presetId: string) => void;
	onReorder: (orderedIds: string[]) => void;
	onResetToDefaults: () => void;
	isAdding: boolean;
	isResetting: boolean;
}

export function AgentsSettingsSidebar({
	configs,
	presets,
	selectedAgentId,
	onSelectAgent,
	onAddAgent,
	onReorder,
	onResetToDefaults,
	isAdding,
	isResetting,
}: AgentsSettingsSidebarProps) {
	const isDark = useIsDarkTheme();
	const sortableIds = useMemo(() => configs.map((c) => c.id), [configs]);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 150, tolerance: 5 },
		}),
		useSensor(KeyboardSensor),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = sortableIds.indexOf(String(active.id));
		const newIndex = sortableIds.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		onReorder(arrayMove(sortableIds, oldIndex, newIndex));
	};

	const listHeader = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={isAdding}
					className={settingsListItemClass(false, "gap-2 w-full text-left")}
				>
					<Plus className="size-3.5 shrink-0" />
					<span className="truncate flex-1">Add agent</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{presets.map((preset) => {
					const icon = getPresetIcon(preset.presetId, isDark);
					return (
						<DropdownMenuItem
							key={preset.presetId}
							onSelect={() => onAddAgent(preset.presetId)}
							className="gap-2"
						>
							{icon ? (
								<img
									src={icon}
									alt=""
									className="size-4 object-contain shrink-0"
								/>
							) : null}
							{preset.label}
						</DropdownMenuItem>
					);
				})}
				{presets.length > 0 ? <DropdownMenuSeparator /> : null}
				<DropdownMenuItem
					onSelect={() => onResetToDefaults()}
					disabled={isResetting}
				>
					Reset to defaults
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={sortableIds}
				strategy={verticalListSortingStrategy}
			>
				<SettingsListSidebar
					searchPlaceholder="Filter agents..."
					searchAriaLabel="Filter agents"
					listHeader={listHeader}
					groups={[{ id: "all", title: "Agents", rows: configs }]}
					filterRow={(row, q) =>
						row.label.toLowerCase().includes(q.toLowerCase())
					}
					getRowKey={(row) => row.id}
					emptyLabel="No agents yet."
					noMatchLabel={(q) => `No agents match "${q}".`}
					renderRow={(row) => (
						<AgentSidebarRow
							row={row}
							isActive={row.id === selectedAgentId}
							onSelect={() => onSelectAgent(row.id)}
							isDark={isDark}
						/>
					)}
				/>
			</SortableContext>
		</DndContext>
	);
}

interface AgentSidebarRowProps {
	row: HostAgentConfigDto;
	isActive: boolean;
	onSelect: () => void;
	isDark: boolean;
}

function AgentSidebarRow({
	row,
	isActive,
	onSelect,
	isDark,
}: AgentSidebarRowProps) {
	const icon = getPresetIcon(row.presetId, isDark);
	const {
		setNodeRef,
		setActivatorNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({ id: row.id });

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
			className={cn("group/row relative", isDragging && "z-10")}
		>
			<button
				type="button"
				onClick={onSelect}
				className={settingsListItemClass(isActive, "gap-2 w-full text-left")}
			>
				{icon ? (
					<img src={icon} alt="" className="size-4 object-contain shrink-0" />
				) : null}
				<span className="truncate flex-1">{row.label}</span>
			</button>
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				className={cn(
					"absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing",
					"opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity",
					isDragging && "opacity-100",
				)}
				aria-label="Drag to reorder"
			>
				<LuGripVertical className="size-3.5" />
			</button>
		</div>
	);
}
