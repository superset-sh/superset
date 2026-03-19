import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { SelectTaskStatus } from "@superset/db/schema";
import { useCallback, useMemo, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { compareStatusesForDropdown } from "../../utils/sorting";
import { KanbanCard } from "./components/KanbanCard";
import { KanbanColumn } from "./components/KanbanColumn";

interface TasksBoardViewProps {
	data: TaskWithStatus[];
	allStatuses: SelectTaskStatus[];
	onTaskClick: (task: TaskWithStatus) => void;
}

export function TasksBoardView({
	data,
	allStatuses,
	onTaskClick,
}: TasksBoardViewProps) {
	const collections = useCollections();
	const [activeTask, setActiveTask] = useState<TaskWithStatus | null>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { distance: 8 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const sortedStatuses = useMemo(
		() => [...allStatuses].sort(compareStatusesForDropdown),
		[allStatuses],
	);

	const tasksByStatus = useMemo(() => {
		const map = new Map<string, TaskWithStatus[]>();
		for (const status of sortedStatuses) {
			map.set(status.id, []);
		}
		for (const task of data) {
			const existing = map.get(task.statusId);
			if (existing) {
				existing.push(task);
			}
		}
		return map;
	}, [data, sortedStatuses]);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const taskId = event.active.id as string;
			const task = data.find((t) => t.id === taskId);
			if (task) setActiveTask(task);
		},
		[data],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveTask(null);
			const { active, over } = event;
			if (!over) return;

			const taskId = active.id as string;
			const overData = over.data.current;

			let targetStatusId: string | null = null;

			if (overData?.type === "column") {
				targetStatusId = overData.statusId as string;
			} else if (overData?.type === "task") {
				const overTask = overData.task as TaskWithStatus;
				targetStatusId = overTask.statusId;
			}

			if (!targetStatusId) return;

			const task = data.find((t) => t.id === taskId);
			if (!task || task.statusId === targetStatusId) return;

			collections.tasks.update(taskId, (draft) => {
				draft.statusId = targetStatusId;
			});
		},
		[data, collections],
	);

	const handleDragCancel = useCallback(() => {
		setActiveTask(null);
	}, []);

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div className="flex-1 flex gap-2 overflow-x-auto overflow-y-hidden px-4 py-3 min-h-0 min-w-0">
				{sortedStatuses.map((status) => (
					<KanbanColumn
						key={status.id}
						status={status}
						tasks={tasksByStatus.get(status.id) ?? []}
						onTaskClick={onTaskClick}
					/>
				))}
			</div>

			<DragOverlay dropAnimation={null}>
				{activeTask && (
					<div className="w-[268px]">
						<KanbanCard task={activeTask} onClick={() => {}} overlay />
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}
