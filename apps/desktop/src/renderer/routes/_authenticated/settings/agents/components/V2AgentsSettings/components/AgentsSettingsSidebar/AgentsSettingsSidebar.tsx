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
import type { HostAgentConfig } from "@superset/host-service/settings";
import type { HostAgentPreset } from "@superset/shared/host-agent-presets";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Plus, Wrench } from "lucide-react";
import { useMemo } from "react";
import { LuGripVertical } from "react-icons/lu";
import {
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../../../components/SettingsListSidebar";
import { AgentIcon } from "../AgentIcon";

interface AgentsSettingsSidebarProps {
	configs: HostAgentConfig[];
	presets: HostAgentPreset[];
	selectedAgentId: string | null;
	onSelectAgent: (id: string) => void;
	onAddAgent: (preset: HostAgentPreset) => void;
	onCreateCustomAgent: () => void;
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
	onCreateCustomAgent,
	onReorder,
	onResetToDefaults,
	isAdding,
	isResetting,
}: AgentsSettingsSidebarProps) {
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
				<DropdownMenuItem className="gap-2" onSelect={onCreateCustomAgent}>
					<Wrench className="size-4 shrink-0 text-muted-foreground" />
					Custom agent…
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{presets.map((preset) => (
					<DropdownMenuItem
						key={preset.presetId}
						onSelect={() => onAddAgent(preset)}
						className="gap-2"
					>
						<AgentIcon presetId={preset.presetId} className="size-4" />
						{preset.label}
					</DropdownMenuItem>
				))}
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
						/>
					)}
				/>
			</SortableContext>
		</DndContext>
	);
}

interface AgentSidebarRowProps {
	row: HostAgentConfig;
	isActive: boolean;
	onSelect: () => void;
}

function AgentSidebarRow({ row, isActive, onSelect }: AgentSidebarRowProps) {
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
				<AgentIcon
					iconId={row.iconId}
					presetId={row.presetId}
					className="size-4"
				/>
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
