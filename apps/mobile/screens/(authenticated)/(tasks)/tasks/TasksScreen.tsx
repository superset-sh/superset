import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import type { TaskCardProps } from "./components/TaskCard";
import { TasksSection } from "./components/TasksSection";
import { TasksSkeleton } from "./components/TasksSkeleton";

// task_statuses.type values: "backlog" | "unstarted" | "started" | "completed" | "canceled"
const ACTIVE_TYPES = new Set(["started", "unstarted"]);
const DONE_TYPES = new Set(["completed", "canceled"]);

export function TasksScreen() {
	const [refreshing, setRefreshing] = useState(false);
	const collections = useCollections();

	const { data: tasks, isLoading: tasksLoading } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);
	const { data: statuses, isLoading: statusesLoading } = useLiveQuery(
		(q) => q.from({ statuses: collections.taskStatuses }),
		[collections],
	);

	const isLoading = tasksLoading || statusesLoading;

	// Miller's Law — bucket into Active / Backlog / Done so the user
	// scans one cognitive group at a time. Done collapses by default
	// (Tesler — push less-relevant complexity behind a tap).
	const sections = useMemo(() => {
		const statusById = new Map(statuses?.map((s) => [s.id, s]) ?? []);
		const buckets: Record<"active" | "backlog" | "done", TaskCardProps[]> = {
			active: [],
			backlog: [],
			done: [],
		};

		const sorted = [...(tasks ?? [])].sort((a, b) => {
			const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
			const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
			return bTs - aTs;
		});

		for (const task of sorted) {
			const status = statusById.get(task.statusId);
			const card: TaskCardProps = {
				id: task.id,
				title: task.title,
				slug: task.slug,
				statusName: status?.name,
				statusColor: status?.color,
			};
			if (status && ACTIVE_TYPES.has(status.type)) buckets.active.push(card);
			else if (status && DONE_TYPES.has(status.type)) buckets.done.push(card);
			else buckets.backlog.push(card);
		}
		return buckets;
	}, [tasks, statuses]);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				collections.tasks.preload(),
				collections.taskStatuses.preload(),
			]);
		} finally {
			setRefreshing(false);
		}
	}, [collections]);

	const isEmpty = !isLoading && (tasks?.length ?? 0) === 0;

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			<View className="px-4 pb-8 pt-2 gap-6">
				{isLoading ? (
					<TasksSkeleton />
				) : isEmpty ? (
					<View className="items-center justify-center py-20">
						<Text className="text-muted-foreground text-center">
							No tasks yet — they'll appear here as they sync
						</Text>
					</View>
				) : (
					<>
						{sections.active.length > 0 ? (
							<TasksSection title="Active" items={sections.active} />
						) : null}
						{sections.backlog.length > 0 ? (
							<TasksSection
								title="Backlog"
								items={sections.backlog}
								defaultCollapsed={sections.active.length > 0}
							/>
						) : null}
						{sections.done.length > 0 ? (
							<TasksSection
								title="Done"
								items={sections.done}
								defaultCollapsed
							/>
						) : null}
					</>
				)}
			</View>
		</ScrollView>
	);
}
