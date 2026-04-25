import type { TaskPriority } from "@superset/db/enums";
import { useMemo } from "react";
import { useOptimisticCollectionMutation } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionMutation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useTaskOptimisticActions() {
	const collections = useCollections();
	const runMutation = useOptimisticCollectionMutation(
		"useTaskOptimisticActions",
	);

	return useMemo(
		() => ({
			updateTitle: (taskId: string, title: string) =>
				runMutation("Failed to update task title", () =>
					collections.tasks.update(taskId, (draft) => {
						draft.title = title;
					}),
				),
			updateDescription: (taskId: string, description: string) =>
				runMutation("Failed to update task description", () =>
					collections.tasks.update(taskId, (draft) => {
						draft.description = description;
					}),
				),
			updateStatus: (taskId: string, statusId: string) =>
				runMutation("Failed to update task status", () =>
					collections.tasks.update(taskId, (draft) => {
						draft.statusId = statusId;
					}),
				),
			updatePriority: (taskId: string, priority: TaskPriority) =>
				runMutation("Failed to update task priority", () =>
					collections.tasks.update(taskId, (draft) => {
						draft.priority = priority;
					}),
				),
			updateAssignee: (taskId: string, assigneeId: string | null) =>
				runMutation("Failed to update task assignee", () =>
					collections.tasks.update(taskId, (draft) => {
						draft.assigneeId = assigneeId;
						draft.assigneeExternalId = null;
						draft.assigneeDisplayName = null;
						draft.assigneeAvatarUrl = null;
					}),
				),
			deleteTask: (taskId: string) =>
				runMutation("Failed to delete task", () =>
					collections.tasks.delete(taskId),
				),
		}),
		[collections, runMutation],
	);
}
