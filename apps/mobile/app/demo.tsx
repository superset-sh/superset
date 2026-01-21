import { useCollections } from "@/providers/CollectionsProvider";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ScrollView, Text, View } from "react-native";

export default function DemoScreen() {
	const collections = useCollections();

	// Basic query - all tasks
	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	// Filtered query - non-deleted tasks only
	const { data: activeTasks } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	// Join query - tasks with status
	const { data: tasksWithStatus } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin(
					{ status: collections.taskStatuses },
					({ tasks, status }) => eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					id: tasks.id,
					title: tasks.title,
					statusName: status.name,
					statusColor: status.color,
				})),
		[collections],
	);

	// All statuses
	const { data: statuses } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);

	return (
		<ScrollView className="flex-1 p-4">
			<Text className="text-2xl font-bold mb-4">
				Electric Collections Demo
			</Text>

			<Text className="text-lg font-semibold mt-4">
				All Tasks ({allTasks?.length || 0})
			</Text>
			{allTasks?.map((t) => (
				<Text key={t.id} className="text-sm">
					{t.title}
				</Text>
			))}

			<Text className="text-lg font-semibold mt-4">
				Active Tasks ({activeTasks?.length || 0})
			</Text>
			{activeTasks?.map((t) => (
				<Text key={t.id} className="text-sm">
					{t.title}
				</Text>
			))}

			<Text className="text-lg font-semibold mt-4">
				Tasks with Status ({tasksWithStatus?.length || 0})
			</Text>
			{tasksWithStatus?.map((t) => (
				<Text key={t.id} className="text-sm">
					{t.title} - {t.statusName}
				</Text>
			))}

			<Text className="text-lg font-semibold mt-4">
				Statuses ({statuses?.length || 0})
			</Text>
			{statuses?.map((s) => (
				<Text key={s.id} className="text-sm">
					{s.name}
				</Text>
			))}
		</ScrollView>
	);
}
